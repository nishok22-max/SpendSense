import io
import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, Body, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

try:
    from .schemas import (
        UserCreate, UserResponse, TransactionResult,
        UploadResponse, PredictRequest, LoginRequest
    )
    from .auth import verify_password, get_password_hash, create_access_token, SECRET_KEY, ALGORITHM
    from .ml.model import model
except ImportError:
    from schemas import (
        UserCreate, UserResponse, TransactionResult,
        UploadResponse, PredictRequest, LoginRequest
    )
    from auth import verify_password, get_password_hash, create_access_token, SECRET_KEY, ALGORITHM
    from ml.model import model
from jose import JWTError, jwt

app = FastAPI(title="AI Expense Analyser API")

# ========================
# CORS
# ========================
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================
# Database
# ========================
DB_CONFIG = dict(
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "expense_tracker"),
    user=os.getenv("DB_USER", "postgres"),
    password=os.getenv("DB_PASS", "12345"),
    port=int(os.getenv("DB_PORT", "5432")),
)

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

def init_db():
    """Create tables if they don't exist."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id VARCHAR(36) PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            date VARCHAR(50),
            description TEXT NOT NULL,
            amount FLOAT NOT NULL,
            category VARCHAR(100),
            confidence FLOAT DEFAULT 100.0,
            keywords TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    cur.close()
    conn.close()

init_db()

# ========================
# Auth Helpers
# ========================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name, email FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(user)

# ========================
# AUTH ENDPOINTS
# ========================

@app.post("/signup", response_model=UserResponse)
@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        hashed = get_password_hash(user.password)
        cur.execute(
            "INSERT INTO users (name, email, password) VALUES (%s, %s, %s) RETURNING id, name, email",
            (user.name, user.email, hashed)
        )
        new_user = cur.fetchone()
        conn.commit()
        return dict(new_user)
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Email already exists")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@app.post("/login")
@app.post("/api/auth/login")
def login(data: LoginRequest):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name, email, password FROM users WHERE email = %s", (data.email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(data={"sub": user["email"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        }
    }


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


# ========================
# Helpers
# ========================
def find_matching_column(columns, keywords):
    for keyword in keywords:
        for col in columns:
            if keyword in str(col).strip().lower():
                return col
    return None


def extract_dataframe(df: pd.DataFrame):
    df = df.dropna(how='all')
    cols = list(df.columns)
    
    # 1. Clean string currency formats before type checking so numeric inference works
    for col in cols:
        if df[col].dtype == object:
            # Remove currency symbols and commas, try to parse to float to see if it's an amount column
            sample = df[col].dropna().astype(str)
            if sample.str.contains(r'\d', regex=True).any():
                cleaned = sample.str.replace(r'[\$\£\€\₹\,]', '', regex=True).str.strip()
                cleaned = cleaned.apply(lambda x: '-' + x[1:-1] if x.startswith('(') and x.endswith(')') else x)
                try_numeric = pd.to_numeric(cleaned, errors='coerce')
                if try_numeric.notna().sum() >= len(df[col].dropna()) * 0.5:
                    df[col] = try_numeric

    # 2. Try keyword match first (most reliable if column names are descriptive)
    date_col = find_matching_column(cols, ["date", "time", "timestamp"])
    desc_col = find_matching_column(cols, ["description", "desc", "merchant", "name", "title", "product", "particulars", "details"])
    amt_col  = find_matching_column(cols, ["amount", "cost", "price", "debit", "withdrawal", "value", "total", "dr", "cr"])

    # 3. Fallbacks using actual data types if column names are unhelpful
    if not amt_col:
        numeric_cols = df.select_dtypes(include=['number']).columns
        if len(numeric_cols) > 0:
            # usually the first or last numeric column is the amount. Choose the first for simplicity
            amt_col = numeric_cols[-1] if len(numeric_cols) > 1 else numeric_cols[0]

    if not date_col:
        for col in cols:
            if col == amt_col: continue
            parsed = pd.to_datetime(df[col], errors='coerce')
            if parsed.notna().sum() > 0:
                date_col = col
                break
        if not date_col:
            df["_date"] = datetime.now().strftime("%Y-%m-%d")
            date_col = "_date"

    if not desc_col:
        text_cols = [c for c in cols if c != date_col and c != amt_col and df[c].dtype == object]
        if text_cols:
            desc_col = text_cols[0]
        else:
            # Absolute fallback
            desc_col = cols[1] if len(cols) > 1 else cols[0]

    if not amt_col:
        amt_col = cols[2] if len(cols) > 2 else cols[0]

    return df, date_col, desc_col, amt_col


def parse_date(raw) -> Optional[datetime]:
    try:
        parsed = pd.to_datetime(raw, errors="coerce")
        if pd.isna(parsed):
            return None
        return parsed.to_pydatetime()
    except Exception:
        return None


def row_to_result(row: dict) -> TransactionResult:
    return TransactionResult(
        id=row["id"],
        date=row["date"],
        description=row["description"],
        amount=row["amount"],
        category=row["category"],
        confidence=float(row["confidence"]),
        keywords=row["keywords"].split(",") if row.get("keywords") else [],
    )


def fetch_user_transactions(user_id: int) -> List[dict]:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, date, description, amount, category, confidence, keywords "
        "FROM transactions WHERE user_id = %s ORDER BY created_at DESC",
        (user_id,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def filter_by_time(rows: List[dict], time_filter: str) -> List[dict]:
    if time_filter == "All time" or not rows:
        return rows

    dated = []
    for r in rows:
        p = parse_date(r["date"])
        if p:
            dated.append((r, p))

    if not dated:
        return rows  # no parseable dates → return all

    latest = max(p for _, p in dated)
    mapping = {
        "Last 7 days": timedelta(days=7),
        "Last 30 days": timedelta(days=30),
        "Last 90 days": timedelta(days=90),
    }
    if time_filter in mapping:
        cutoff = latest - mapping[time_filter]
        filtered = [r for r, p in dated if p >= cutoff]
    elif time_filter == "This year":
        filtered = [r for r, p in dated if p.year == latest.year]
    else:
        filtered = rows

    return filtered if filtered else [rows[0]]


def build_analytics(rows: List[dict]) -> dict:
    category_totals: dict = defaultdict(float)
    for r in rows:
        category_totals[r["category"]] += abs(r["amount"])

    spending_by_category = [
        {"name": name, "value": round(val, 2)}
        for name, val in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
        if val > 0
    ]

    dated_points = []
    for r in rows:
        p = parse_date(r["date"])
        if p:
            dated_points.append((p, abs(r["amount"])))
    dated_points.sort(key=lambda x: x[0])

    daily_trends, monthly_trends = [], []
    if dated_points:
        daily: dict = defaultdict(float)
        for dt, amt in dated_points:
            daily[datetime(dt.year, dt.month, dt.day)] += amt
        cum = 0
        for dt, val in sorted(daily.items()):
            cum += val
            daily_trends.append({"date": dt.strftime("%b %d"), "spending": round(val, 2), "cumulative": round(cum, 2)})

        monthly: dict = defaultdict(float)
        for dt, amt in dated_points:
            monthly[datetime(dt.year, dt.month, 1)] += amt
        cum = 0
        for dt, val in sorted(monthly.items()):
            cum += val
            monthly_trends.append({"month": dt.strftime("%b %Y"), "spending": round(val, 2), "cumulative": round(cum, 2)})

    total = round(sum(abs(r["amount"]) for r in rows), 2)
    confidences = [float(r["confidence"]) for r in rows if r.get("confidence")]
    avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 0.0

    return {
        "spendingByCategory": spending_by_category,
        "dailyTrends": daily_trends,
        "monthlyTrends": monthly_trends,
        "totalSpending": total,
        "predictionAccuracy": avg_conf,
        "processedTransactions": len(rows),
    }


# ========================
# TRANSACTION ENDPOINTS
# ========================

@app.post("/api/upload", response_model=UploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read CSV: {e}")

    if df.empty:
        return {"transactions": [], "errors": []}

    df, date_col, desc_col, amt_col = extract_dataframe(df)

    results: List[TransactionResult] = []
    errors = []
    to_insert = []

    # Fast Vectorized Preprocessing
    df['__tmp_desc'] = df[desc_col].astype(str).str.strip()
    df['__tmp_desc'] = df['__tmp_desc'].replace("nan", "")
    
    missing_desc = df['__tmp_desc'] == ""
    missing_amt = df[amt_col].isna()
    
    # Store errors for missing base data
    for i in df[missing_desc].index:
        errors.append({"row": int(i) + 2, "issue": "Missing description"})
    for i in df[missing_amt & ~missing_desc].index:
        errors.append({"row": int(i) + 2, "issue": "Missing amount"})
        
    # Drop rows that don't have descriptions or amounts to maintain integrity
    df = df[~missing_desc & ~missing_amt].copy()

    def clean_amount(val):
        if pd.isna(val): return None
        if isinstance(val, (int, float)): return float(val)
        val = str(val).replace("$","").replace("₹","").replace("€","").replace("£","").replace(",","").strip()
        if val.startswith("(") and val.endswith(")"): val = f"-{val[1:-1]}"
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    df['__clean_amt'] = df[amt_col].apply(clean_amount)
    invalid_amt = df['__clean_amt'].isna()
    for i in df[invalid_amt].index:
        errors.append({"row": int(i) + 2, "issue": f"Invalid amount: {df.loc[i, amt_col]}"})
        
    df = df[~invalid_amt].copy()
    
    if not df.empty:
        # Format remaining dates natively
        df['__clean_date'] = df[date_col].fillna("").astype(str)
        df.loc[df['__clean_date'] == "", '__clean_date'] = datetime.now().strftime("%Y-%m-%d")

        descriptions = df['__tmp_desc'].tolist()
        amounts = df['__clean_amt'].tolist()
        dates = df['__clean_date'].tolist()
        user_id = int(current_user["id"])

        # Super-fast batch machine-learning predictions
        try:
            batch_preds = model.predict_batch(descriptions)
        except AttributeError:
            batch_preds = [model.predict(d) for d in descriptions]

        for idx in range(len(descriptions)):
            desc = descriptions[idx]
            amt = amounts[idx]
            date_str = dates[idx]
            pred = batch_preds[idx]  # type: ignore
            
            conf = float(pred["confidence"])
            cat = str(pred["category"])
            keys = [str(k) for k in pred.get("keywords", [])]
            keys_str = ",".join(keys)
            tx_id = str(uuid.uuid4())

            to_insert.append((
                tx_id, user_id, date_str, desc,
                amt, cat, conf, keys_str
            ))
            
            # Browser protection: Return preview of max 500 rows to the UI to avoid crashing Chrome/Safari
            if len(results) < 500:
                results.append(TransactionResult(
                    id=tx_id, date=date_str, description=desc, amount=amt,
                    category=cat, confidence=conf, keywords=keys
                ))

    if to_insert:
        conn = get_conn()
        cur = conn.cursor()
        # PsycoPG2 executemany can insert 100,000 rows in < 1 second natively.
        cur.executemany(
            "INSERT INTO transactions (id, user_id, date, description, amount, category, confidence, keywords) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            to_insert
        )
        conn.commit()
        cur.close()
        conn.close()

    return {"transactions": results, "errors": errors[:100]}  # type: ignore

@app.delete("/api/transactions")
def delete_all_transactions(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM transactions WHERE user_id = %s", (current_user["id"],))
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "All transactions deleted successfully"}

@app.post("/api/predict")
def predict_category(req: PredictRequest):
    return model.predict(req.description)


@app.post("/api/recategorize", response_model=List[TransactionResult])
def recategorize(current_user: dict = Depends(get_current_user)):
    rows = fetch_user_transactions(current_user["id"])
    if not rows:
        return []

    conn = get_conn()
    cur = conn.cursor()
    updated = []
    for r in rows:
        pred = model.predict(r["description"])
        # Cast numpy types → native Python types
        cat  = str(pred["category"])
        conf = float(pred["confidence"])
        keys = [str(k) for k in pred["keywords"]]
        cur.execute(
            "UPDATE transactions SET category=%s, confidence=%s, keywords=%s WHERE id=%s",
            (cat, conf, ",".join(keys), r["id"])
        )
        r["category"] = cat
        r["confidence"] = conf
        r["keywords"] = ",".join(pred["keywords"])
        updated.append(row_to_result(r))
    conn.commit()
    cur.close()
    conn.close()
    return updated


@app.patch("/api/transactions/{tx_id}/category", response_model=TransactionResult)
def update_category(
    tx_id: str,
    new_category: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user),
):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "UPDATE transactions SET category=%s, confidence=100.0, keywords='User specified' "
        "WHERE id=%s AND user_id=%s RETURNING id, date, description, amount, category, confidence, keywords",
        (new_category, tx_id, current_user["id"])
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return row_to_result(dict(row))


@app.get("/api/transactions", response_model=List[TransactionResult])
def get_transactions(
    timeFilter: str = Query("Last 30 days"),
    current_user: dict = Depends(get_current_user),
):
    rows = fetch_user_transactions(current_user["id"])
    filtered = filter_by_time(rows, timeFilter)
    return [row_to_result(r) for r in filtered]


@app.get("/api/recent", response_model=List[TransactionResult])
def get_recent(
    timeFilter: str = Query("Last 30 days"),
    current_user: dict = Depends(get_current_user),
):
    rows = fetch_user_transactions(current_user["id"])
    filtered = filter_by_time(rows, timeFilter)
    return [row_to_result(r) for r in filtered[:5]]


@app.get("/api/analytics")
def get_analytics(
    timeFilter: str = Query("Last 30 days"),
    current_user: dict = Depends(get_current_user),
):
    rows = fetch_user_transactions(current_user["id"])
    filtered = filter_by_time(rows, timeFilter)
    return build_analytics(filtered)


@app.get("/api/insights")
def get_insights(
    timeFilter: str = Query("Last 30 days"),
    current_user: dict = Depends(get_current_user),
):
    rows = fetch_user_transactions(current_user["id"])
    filtered = filter_by_time(rows, timeFilter)
    if not filtered:
        return []

    stats = build_analytics(filtered)
    insights = []
    total = stats["totalSpending"]
    cats = stats["spendingByCategory"]

    if cats:
        top = cats[0]
        pct = round((top["value"] / total) * 100, 1) if total else 0
        insights.append({
            "id": 1, "type": "habit", "icon": "TrendingUp",
            "title": f"High Spending in {top['name']}",
            "description": f"You spent ${top['value']} on {top['name']}, which is {pct}% of total spending.",
            "impact": "neutral", "action": "Review transactions",
            "details": [f"Total: ${top['value']}"]
        })

    coffee_txs = [r for r in filtered if r.get("category") == "Coffee"]
    if len(coffee_txs) >= 3:
        total_coffee = round(sum(abs(r["amount"]) for r in coffee_txs), 2)
        insights.append({
            "id": 2, "type": "recommendation", "icon": "PiggyBank",
            "title": "High Frequency Coffee Spending",
            "description": f"Frequent coffee purchases totaling ${total_coffee}.",
            "impact": "warning", "action": "Track this habit",
            "details": [f"Total: ${total_coffee}"]
        })

    if total > 0 and len(filtered) > 5:
        large = [r for r in filtered if abs(r["amount"]) > total * 0.2]
        if large:
            biggest = max(large, key=lambda r: abs(r["amount"]))
            insights.append({
                "id": 3, "type": "unusual", "icon": "AlertTriangle",
                "title": "Unusually Large Expense",
                "description": f"${abs(biggest['amount'])} at {biggest['description']}.",
                "impact": "warning", "action": "Review transaction",
                "details": [f"Amount: ${abs(biggest['amount'])}", f"Date: {biggest['date']}"]
            })

    if not insights:
        insights.append({
            "id": 4, "type": "recommendation", "icon": "Target",
            "title": "Spending Looks Typical",
            "description": "No unusual patterns detected in this period.",
            "impact": "positive", "action": "View budget",
            "details": ["Keep up the good habits"]
        })

    return insights


@app.get("/")
def root():
    return {"status": "ok", "message": "AI Expense Analyser API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)