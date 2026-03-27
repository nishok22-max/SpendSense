import io
import os
import re
import uuid
import secrets
from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import pandas as pd
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer

try:
    from .schemas import (UserCreate, UserResponse, TransactionResult, UploadResponse, PredictRequest, LoginRequest)
    from .auth import verify_password, get_password_hash, create_access_token, SECRET_KEY, ALGORITHM
    from .ml.model import model
    from .csv_analyzer import analyze_csv_structure, process_with_mapping
    from .email_service import send_email, build_verification_email, build_reset_email, FRONTEND_URL
except ImportError:
    from schemas import (UserCreate, UserResponse, TransactionResult, UploadResponse, PredictRequest, LoginRequest)
    from auth import verify_password, get_password_hash, create_access_token, SECRET_KEY, ALGORITHM
    from ml.model import model
    from csv_analyzer import analyze_csv_structure, process_with_mapping
    from email_service import send_email, build_verification_email, build_reset_email, FRONTEND_URL

from jose import JWTError, jwt

app = FastAPI(title="SpendSense API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            status VARCHAR(20) DEFAULT 'completed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Idempotent migrations
    cur.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='transactions' AND column_name='status'
          ) THEN
            ALTER TABLE transactions ADD COLUMN status VARCHAR(20) DEFAULT 'completed';
          END IF;
        END $$;
    """)
    # Add email_verified column (existing users default TRUE so they aren't locked out)
    cur.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='users' AND column_name='email_verified'
          ) THEN
            ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT TRUE;
          END IF;
        END $$;
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(128) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(128) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            type VARCHAR(50) DEFAULT 'info',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS column_mappings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            original_col VARCHAR(255) NOT NULL,
            mapped_type VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, original_col)
        )
    """)
    cur.execute("UPDATE transactions SET category = 'Food' WHERE category = 'Food & Dining'")
    conn.commit()
    cur.close()
    conn.close()

init_db()

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

def create_notification(user_id: int, message: str, type: str = "info"):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO notifications (user_id, message, type) VALUES (%s, %s, %s)",
            (user_id, message, type)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


# ========================
# AUTH
# ========================

@app.post("/signup", response_model=UserResponse)
@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        hashed = get_password_hash(user.password)
        # New users start unverified
        cur.execute(
            "INSERT INTO users (name, email, password, email_verified) VALUES (%s, %s, %s, FALSE) RETURNING id, name, email",
            (user.name, user.email, hashed)
        )
        new_user = cur.fetchone()
        user_id = new_user["id"]
        # Create verification token (24 h expiry)
        token = secrets.token_urlsafe(48)
        expires = datetime.utcnow() + timedelta(hours=24)
        cur.execute(
            "INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user_id, token, expires)
        )
        conn.commit()
        # Send verification email (non-blocking: failure doesn't crash registration)
        try:
            subject, html, text = build_verification_email(user.name, token)
            send_email(user.email, subject, html, text)
        except Exception as mail_err:
            print(f"[EMAIL ERROR] {mail_err}")
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
    cur.execute("SELECT id, name, email, password, email_verified FROM users WHERE email = %s", (data.email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
    token = create_access_token(data={"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer",
            "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@app.get("/api/auth/verify-email")
def verify_email(token: str = Query(...)):
    """Validates email verification token, marks user verified, redirects to login."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, user_id, expires_at, used FROM email_verification_tokens WHERE token = %s",
        (token,)
    )
    record = cur.fetchone()
    if not record or record["used"] or datetime.utcnow() > record["expires_at"]:
        cur.close(); conn.close()
        return RedirectResponse(url=f"{FRONTEND_URL}/verify-email?status=invalid")
    cur.execute("UPDATE users SET email_verified = TRUE WHERE id = %s", (record["user_id"],))
    cur.execute("UPDATE email_verification_tokens SET used = TRUE WHERE id = %s", (record["id"],))
    conn.commit()
    cur.close(); conn.close()
    return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=1")


@app.post("/api/auth/resend-verification")
def resend_verification(body: dict = Body(...)):
    """Re-sends verification email. Rate-limited: only if last token was sent >60s ago."""
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name, email_verified FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    if not user or user["email_verified"]:
        cur.close(); conn.close()
        # Don't reveal if email exists
        return {"message": "If this email exists and is unverified, a new link has been sent."}
    # Rate limit: check last token created_at
    cur.execute(
        "SELECT created_at FROM email_verification_tokens WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
        (user["id"],)
    )
    last = cur.fetchone()
    if last and (datetime.utcnow() - last["created_at"]).total_seconds() < 60:
        cur.close(); conn.close()
        raise HTTPException(status_code=429, detail="Please wait a minute before requesting another verification email.")
    token = secrets.token_urlsafe(48)
    expires = datetime.utcnow() + timedelta(hours=24)
    cur.execute(
        "INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user["id"], token, expires)
    )
    conn.commit()
    cur.close(); conn.close()
    try:
        subject, html, text = build_verification_email(user["name"], token)
        send_email(email, subject, html, text)
    except Exception as mail_err:
        print(f"[EMAIL ERROR] {mail_err}")
    return {"message": "If this email exists and is unverified, a new link has been sent."}


@app.post("/api/auth/forgot-password")
def forgot_password(body: dict = Body(...)):
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    if user:
        token = secrets.token_urlsafe(48)
        expires = datetime.utcnow() + timedelta(hours=1)
        cur.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user["id"], token, expires)
        )
        conn.commit()
        try:
            subject, html, text = build_reset_email(user["name"], token)
            send_email(email, subject, html, text)
        except Exception as mail_err:
            print(f"[EMAIL ERROR] Fallback link: {FRONTEND_URL}/reset-password?token={token} | Error: {mail_err}")
    cur.close()
    conn.close()
    return {"message": "If this email exists, a reset link has been sent."}


@app.post("/api/auth/reset-password")
def reset_password(body: dict = Body(...)):
    token = body.get("token", "").strip()
    new_password = body.get("new_password", "")
    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token and new password are required")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = %s", (token,))
    record = cur.fetchone()
    if not record:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Invalid reset token")
    if record["used"]:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Reset link already used")
    if datetime.utcnow() > record["expires_at"]:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Reset link has expired")
    hashed = get_password_hash(new_password)
    cur.execute("UPDATE users SET password = %s WHERE id = %s", (hashed, record["user_id"]))
    cur.execute("UPDATE password_reset_tokens SET used = TRUE WHERE id = %s", (record["id"],))
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Password reset successfully"}


@app.delete("/api/auth/delete-account")
def delete_account(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = current_user["id"]
        cur.execute("DELETE FROM notifications WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM password_reset_tokens WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM transactions WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
    return {"message": "Account deleted"}


# ========================
# NOTIFICATIONS
# ========================

@app.get("/api/notifications")
def get_notifications(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, message, type, is_read, created_at FROM notifications "
        "WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
        (current_user["id"],)
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE notifications SET is_read = TRUE WHERE id = %s AND user_id = %s",
        (notification_id, current_user["id"])
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Marked as read"}


@app.patch("/api/notifications/read-all")
def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = %s", (current_user["id"],))
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "All marked as read"}


# ========================
# HELPERS
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
    
    # Normalize column names for matching (strip ₹, $, etc.)
    def norm_col(c):
        return re.sub(r'[₹$€£¥\s]', ' ', str(c)).lower().strip()
    
    for col in cols:
        if df[col].dtype == object:
            sample = df[col].dropna().astype(str)
            if sample.str.contains(r'\d', regex=True).any():
                cleaned = sample.str.replace(r'[\$\£\€\₹\,]', '', regex=True).str.strip()
                cleaned = cleaned.apply(lambda x: '-' + x[1:-1] if x.startswith('(') and x.endswith(')') else x)
                try_numeric = pd.to_numeric(cleaned, errors='coerce')
                if try_numeric.notna().sum() >= len(df[col].dropna()) * 0.5:
                    df[col] = try_numeric

    # Match columns using normalized names
    date_col = next((c for c in cols if any(k in norm_col(c) for k in ["date", "time", "timestamp", "posting", "value dt"])), None)
    desc_col = next((c for c in cols if any(k in norm_col(c) for k in ["description", "desc", "merchant", "name", "title", "particulars", "details", "narration"])), None)

    # Prefer debit/withdrawal columns over balance/credit
    debit_col = next((c for c in cols if any(k in norm_col(c) for k in ["debit", "withdrawal", "dr amt", "paid"])), None)
    amt_col = debit_col or find_matching_column(cols, ["amount", "cost", "price", "credit", "value", "total"])

    if not amt_col:
        numeric_cols = df.select_dtypes(include=['number']).columns
        if len(numeric_cols) > 0:
            # Prefer non-balance numeric columns
            non_bal = [c for c in numeric_cols if "balance" not in norm_col(c)]
            amt_col = non_bal[-1] if non_bal else numeric_cols[0]

    if not date_col:
        for col in cols:
            if col == amt_col: continue
            if pd.to_datetime(df[col], errors='coerce').notna().sum() > 0:
                date_col = col; break
        if not date_col:
            df["_date"] = datetime.now().strftime("%Y-%m-%d")
            date_col = "_date"

    if not desc_col:
        text_cols = [c for c in cols if c != date_col and c != amt_col and df[c].dtype == object]
        desc_col = text_cols[0] if text_cols else (cols[1] if len(cols) > 1 else cols[0])

    if not amt_col:
        amt_col = cols[2] if len(cols) > 2 else cols[0]

    return df, date_col, desc_col, amt_col


def parse_date(raw) -> Optional[datetime]:
    try:
        parsed = pd.to_datetime(raw, errors="coerce")
        return None if pd.isna(parsed) else parsed.to_pydatetime()
    except Exception:
        return None


def row_to_result(row: dict) -> TransactionResult:
    return TransactionResult(
        id=row["id"], date=row["date"], description=row["description"],
        amount=row["amount"], category=row["category"],
        confidence=float(row.get("confidence", 100.0)),
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
    dated = [(r, parse_date(r["date"])) for r in rows]
    dated = [(r, p) for r, p in dated if p]
    if not dated:
        return rows
    latest = max(p for _, p in dated)
    mapping = {"Last 7 days": timedelta(days=7), "Last 30 days": timedelta(days=30), "Last 90 days": timedelta(days=90)}
    if time_filter in mapping:
        cutoff = latest - mapping[time_filter]
        filtered = [r for r, p in dated if p >= cutoff]
    elif time_filter == "This month":
        filtered = [r for r, p in dated if p.year == latest.year and p.month == latest.month]
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

    dated_points = [(parse_date(r["date"]), abs(r["amount"])) for r in rows]
    dated_points = [(p, a) for p, a in dated_points if p]
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
# STATEMENT CONVERSION
# ========================

@app.post("/api/convert-statement")
async def convert_statement(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    contents = await file.read()
    filename = file.filename or "statement"
    if filename.lower().endswith((".xls", ".xlsx")):
        try:
            df = pd.read_excel(io.BytesIO(contents))
            return {"csv": df.to_csv(index=False), "filename": filename.rsplit(".", 1)[0] + ".csv"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot read Excel: {e}")
    elif filename.lower().endswith(".pdf"):
        import pdfplumber, re
        try:
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                all_dfs = []
                for page in pdf.pages:
                    for table in (page.extract_tables() or []):
                        if not table or len(table) < 2: continue
                        header = [str(h).replace('\n', ' ').strip() if h else f"Col_{i}" for i, h in enumerate(table[0])]
                        df_temp = pd.DataFrame(table[1:], columns=header).dropna(how='all')
                        all_dfs.append(df_temp)
                if all_dfs:
                    combined_df = pd.concat(all_dfs, ignore_index=True)
                else:
                    rows = []
                    d1 = r'([A-Z][a-z]{2}\s\d{2},\s\d{4})'
                    d2 = r'(\d{2}[/-]\d{2}[/-]\d{2,4})'
                    ap = r'([₹$€£]?\s?-?[\d,]+\.\d{2}|[₹$€£]-?\s?[\d,]+(?:\.\d+)?)'
                    for page in pdf.pages:
                        for line in (page.extract_text() or "").split('\n'):
                            line = line.strip()
                            if not line or any(k in line for k in ["Transaction ID", "UTR No", "Paid by", "Page"]): continue
                            dm = re.search(f'^{d1}|^{d2}', line)
                            if dm:
                                ams = list(re.finditer(ap, line))
                                if ams:
                                    am = ams[-1]
                                    amt_str = am.group(1)
                                    desc = re.sub(r'^(?:Paid to|Received from|Payment to)\s+', '', line[dm.end():am.start()].strip(), flags=re.IGNORECASE)
                                    if ("DEBIT" in line.upper() or "PAID TO" in line.upper()) and not amt_str.startswith("-"):
                                        amt_str = "-" + amt_str
                                    rows.append({"Date": dm.group(1) or dm.group(2), "Description": desc, "Amount": amt_str})
                    if not rows:
                        raise HTTPException(status_code=400, detail="No readable data found in PDF")
                    combined_df = pd.DataFrame(rows)
                return {"csv": combined_df.to_csv(index=False), "filename": filename.rsplit(".", 1)[0] + ".csv"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot parse PDF: {e}")
    raise HTTPException(status_code=400, detail="Unsupported format. Upload PDF or Excel.")


# ========================
# UPLOAD & PROCESS
# ========================

@app.post("/api/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    contents = await file.read()
    filename = (file.filename or "").lower()
    if filename.endswith((".xls", ".xlsx")):
        try:
            df = pd.read_excel(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot read Excel: {e}")
    elif filename.endswith(".pdf"):
        import pdfplumber, re
        try:
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                all_dfs = []
                for page in pdf.pages:
                    for table in (page.extract_tables() or []):
                        if not table or len(table) < 2: continue
                        header = [str(h).replace('\n', ' ').strip() if h else f"Col_{i}" for i, h in enumerate(table[0])]
                        all_dfs.append(pd.DataFrame(table[1:], columns=header).dropna(how='all'))
                if all_dfs:
                    df = pd.concat(all_dfs, ignore_index=True)
                else:
                    rows = []
                    d1 = r'([A-Z][a-z]{2}\s\d{2},\s\d{4})'
                    d2 = r'(\d{2}[/-]\d{2}[/-]\d{2,4})'
                    ap = r'([₹$€£]?\s?-?[\d,]+\.\d{2}|[₹$€£]-?\s?[\d,]+(?:\.\d+)?)'
                    for page in pdf.pages:
                        for line in (page.extract_text() or "").split('\n'):
                            line = line.strip()
                            if not line or any(k in line for k in ["Transaction ID", "UTR No", "Paid by", "Page"]): continue
                            dm = re.search(f'^{d1}|^{d2}', line)
                            if dm:
                                ams = list(re.finditer(ap, line))
                                if ams:
                                    am = ams[-1]
                                    amt_str = am.group(1)
                                    desc = re.sub(r'^(?:Paid to|Received from|Payment to)\s+', '', line[dm.end():am.start()].strip(), flags=re.IGNORECASE)
                                    if ("DEBIT" in line.upper() or "PAID TO" in line.upper()) and not amt_str.startswith("-"):
                                        amt_str = "-" + amt_str
                                    rows.append({"Date": dm.group(1) or dm.group(2), "Description": desc, "Amount": amt_str})
                    if not rows:
                        raise HTTPException(status_code=400, detail="No readable data found in PDF")
                    df = pd.DataFrame(rows)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot parse PDF: {e}")
    else:
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

    df['__tmp_desc'] = df[desc_col].astype(str).str.strip().replace("nan", "")
    missing_desc = df['__tmp_desc'] == ""
    missing_amt = df[amt_col].isna()
    for i in df[missing_desc].index:
        errors.append({"row": int(i) + 2, "issue": "Missing description"})
    for i in df[missing_amt & ~missing_desc].index:
        errors.append({"row": int(i) + 2, "issue": "Missing amount"})
    df = df[~missing_desc & ~missing_amt].copy()

    def clean_amount(val):
        if pd.isna(val): return None
        if isinstance(val, (int, float)): return float(val)
        val = str(val).replace("$","").replace("₹","").replace("€","").replace("£","").replace(",","").strip()
        if val.startswith("(") and val.endswith(")"): val = f"-{val[1:-1]}"
        try: return float(val)
        except: return None

    df['__clean_amt'] = df[amt_col].apply(clean_amount)
    for i in df[df['__clean_amt'].isna()].index:
        errors.append({"row": int(i) + 2, "issue": f"Invalid amount: {df.loc[i, amt_col]}"})
    df = df[~df['__clean_amt'].isna()].copy()

    if not df.empty:
        df['__clean_date'] = df[date_col].fillna("").astype(str)
        df.loc[df['__clean_date'] == "", '__clean_date'] = datetime.now().strftime("%Y-%m-%d")
        descriptions = df['__tmp_desc'].tolist()
        amounts = df['__clean_amt'].tolist()
        dates = df['__clean_date'].tolist()
        user_id = int(current_user["id"])
        try:
            batch_preds = model.predict_batch(descriptions)
        except AttributeError:
            batch_preds = [model.predict(d) for d in descriptions]

        for idx in range(len(descriptions)):
            desc, amt, date_str = descriptions[idx], amounts[idx], dates[idx]
            pred = batch_preds[idx]
            cat = str(pred["category"])
            conf = float(pred["confidence"])
            keys_str = ",".join(str(k) for k in pred.get("keywords", []))
            tx_id = str(uuid.uuid4())
            to_insert.append((tx_id, user_id, date_str, desc, amt, cat, conf, keys_str, "completed"))
            if len(results) < 500:
                results.append(TransactionResult(
                    id=tx_id, date=date_str, description=desc, amount=amt,
                    category=cat, confidence=conf, keywords=keys_str.split(",") if keys_str else []
                ))

    if to_insert:
        conn = get_conn()
        cur = conn.cursor()
        cur.executemany(
            "INSERT INTO transactions (id, user_id, date, description, amount, category, confidence, keywords, status) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            to_insert
        )
        conn.commit()

        # Check budget thresholds and create notifications
        total = sum(abs(row[4]) for row in to_insert)
        if total > 5000:
            create_notification(int(current_user["id"]), f"⚠️ High spending detected: ${total:.2f} uploaded in one batch.", "warning")
        cur.close()
        conn.close()

    return {"transactions": results, "errors": errors[:100]}


# ========================
# TRANSACTIONS
# ========================

@app.post("/api/transactions", response_model=TransactionResult)
def create_transaction(tx: dict = Body(...), current_user: dict = Depends(get_current_user)):
    tx_id = str(uuid.uuid4())
    date_str = tx.get("date", datetime.now().strftime("%Y-%m-%d"))
    desc = tx.get("description", "Manual entry")
    amount = float(tx.get("amount", 0))
    cat = tx.get("category", "Other")
    
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO transactions (id, user_id, date, description, amount, category, confidence, keywords, status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'completed')",
        (tx_id, current_user["id"], date_str, desc, amount, cat, 100.0, "manual")
    )
    conn.commit()
    cur.close()
    conn.close()
    
    return TransactionResult(
        id=tx_id, date=date_str, description=desc, amount=amount,
        category=cat, confidence=100.0, keywords=["manual"]
    )


@app.delete("/api/transactions")
def delete_all_transactions(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM transactions WHERE user_id = %s", (current_user["id"],))
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "All transactions deleted"}


@app.post("/api/predict")
def predict_category(req: PredictRequest):
    result = model.predict(req.description)
    cat = str(result["category"])
    result["category"] = cat
    return result


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
        cat = str(pred["category"])
        conf = float(pred["confidence"])
        keys = [str(k) for k in pred["keywords"]]
        cur.execute("UPDATE transactions SET category=%s, confidence=%s, keywords=%s WHERE id=%s",
                    (cat, conf, ",".join(keys), r["id"]))
        r["category"] = cat; r["confidence"] = conf; r["keywords"] = ",".join(keys)
        updated.append(row_to_result(r))
    conn.commit()
    cur.close()
    conn.close()
    return updated


@app.patch("/api/transactions/{tx_id}/category", response_model=TransactionResult)
def update_category(tx_id: str, new_category: str = Body(..., embed=True), current_user: dict = Depends(get_current_user)):
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
def get_transactions(timeFilter: str = Query("Last 30 days"), current_user: dict = Depends(get_current_user)):
    rows = fetch_user_transactions(current_user["id"])
    return [row_to_result(r) for r in filter_by_time(rows, timeFilter)]


@app.get("/api/recent", response_model=List[TransactionResult])
def get_recent(timeFilter: str = Query("Last 30 days"), current_user: dict = Depends(get_current_user)):
    rows = fetch_user_transactions(current_user["id"])
    return [row_to_result(r) for r in filter_by_time(rows, timeFilter)[:5]]


@app.get("/api/analytics")
def get_analytics(timeFilter: str = Query("Last 30 days"), current_user: dict = Depends(get_current_user)):
    rows = fetch_user_transactions(current_user["id"])
    return build_analytics(filter_by_time(rows, timeFilter))


@app.get("/api/insights")
def get_insights(timeFilter: str = Query("Last 30 days"), current_user: dict = Depends(get_current_user)):
    rows = fetch_user_transactions(current_user["id"])
    filtered = filter_by_time(rows, timeFilter)
    if not filtered:
        return []

    stats = build_analytics(filtered)
    insights = []
    total = stats["totalSpending"]
    cats = stats["spendingByCategory"]
    monthly = stats["monthlyTrends"]

    if cats:
        top = cats[0]
        pct = round((top["value"] / total) * 100, 1) if total else 0
        insights.append({"id": 1, "type": "habit", "icon": "TrendingUp",
                          "title": f"Top Spending: {top['name']}",
                          "description": f"${top['value']} on {top['name']} — {pct}% of total spending.",
                          "impact": "neutral", "action": "Review transactions",
                          "details": [f"Total: ${top['value']}", f"Share: {pct}%"]})

    food_txs = [r for r in filtered if r.get("category") in ("Coffee", "Food", "Groceries")]
    if len(food_txs) >= 3:
        food_total = round(sum(abs(r["amount"]) for r in food_txs), 2)
        insights.append({"id": 2, "type": "recommendation", "icon": "PiggyBank",
                          "title": "Frequent Food & Beverage Spending",
                          "description": f"{len(food_txs)} transactions totaling ${food_total}. Small habits add up!",
                          "impact": "warning", "action": "Track this habit",
                          "details": [f"Total: ${food_total}", f"Count: {len(food_txs)}"]})

    if total > 0 and len(filtered) > 5:
        large = [r for r in filtered if abs(r["amount"]) > total * 0.2]
        if large:
            biggest = max(large, key=lambda r: abs(r["amount"]))
            insights.append({"id": 3, "type": "unusual", "icon": "AlertTriangle",
                              "title": "Unusually Large Transaction",
                              "description": f"${abs(biggest['amount']):.2f} at '{biggest['description']}' is notably large.",
                              "impact": "warning", "action": "Review transaction",
                              "details": [f"Amount: ${abs(biggest['amount']):.2f}", f"Date: {biggest['date']}"]})

    if len(monthly) >= 2:
        last, prev = monthly[-1]["spending"], monthly[-2]["spending"]
        pct_chg = ((last - prev) / prev * 100) if prev > 0 else 0
        if pct_chg > 20:
            insights.append({"id": 4, "type": "unusual", "icon": "TrendingUp",
                              "title": "Spending Spike Detected",
                              "description": f"Spending jumped {pct_chg:.1f}% vs last month (${prev:.0f} → ${last:.0f}).",
                              "impact": "warning", "action": "View budget",
                              "details": [f"Previous: ${prev:.0f}", f"Current: ${last:.0f}"]})

    if not insights:
        insights.append({"id": 5, "type": "recommendation", "icon": "Target",
                          "title": "Spending Looks Healthy",
                          "description": "No unusual patterns detected this period. Keep it up!",
                          "impact": "positive", "action": "View budget",
                          "details": ["No anomalies found"]})

    return insights




# ========================
# UNIVERSAL CSV ANALYSIS
# ========================

def _read_any_csv(contents: bytes, filename: str) -> pd.DataFrame:
    if filename.endswith((".xls", ".xlsx")):
        return pd.read_excel(io.BytesIO(contents))
    elif filename.endswith(".pdf"):
        import pdfplumber
        rows = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                for table in (page.extract_tables() or []):
                    for row in table:
                        clean_row = [str(cell).replace('\n', ' ').strip() if cell else "" for cell in row]
                        if any(clean_row):
                            rows.append(clean_row)
        if not rows:
            raise ValueError("No readable table data found in PDF")
        
        header_idx = 0
        for i, row in enumerate(rows[:30]):
            r_str = " ".join(row).lower()
            if any(k in r_str for k in ["date", "desc", "details", "particulars"]) and any(k in r_str for k in ["amount", "balance", "debit", "credit", "withdrawal"]):
                header_idx = i
                break
                
        header = rows[header_idx]
        final_header = []
        for i, h in enumerate(header):
            name = h if h else f"Col_{i}"
            if name in final_header:
                name = f"{name}_{i}"
            final_header.append(name)
            
        data_rows = []
        for r in rows[header_idx+1:]:
            if " ".join(r) == " ".join(header):
                continue
            r_str = " ".join(r).lower()
            if "page " in r_str and len(list(filter(None, r))) == 1:
                continue
            if "brought forward" in r_str or "carried forward" in r_str:
                continue
            if len(r) < len(final_header):
                r.extend([""] * (len(final_header) - len(r)))
            elif len(r) > len(final_header):
                r = r[:len(final_header)]
            data_rows.append(r)
            
        return pd.DataFrame(data_rows, columns=final_header)

    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(io.StringIO(contents.decode(enc)))
        except UnicodeDecodeError:
            continue
        except pd.errors.EmptyDataError:
            return pd.DataFrame()
    raise ValueError("Cannot decode file — try saving as UTF-8.")


def _get_stored_mappings(user_id: int) -> dict:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT original_col, mapped_type FROM column_mappings WHERE user_id = %s",
        (user_id,)
    )
    rows = {r["original_col"]: r["mapped_type"] for r in cur.fetchall()}
    cur.close(); conn.close()
    return rows


def _store_mapping(user_id: int, col_name: str, mapped_type: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO column_mappings (user_id, original_col, mapped_type)
        VALUES (%s, %s, %s)
        ON CONFLICT (user_id, original_col) DO UPDATE SET mapped_type = EXCLUDED.mapped_type
    """, (user_id, col_name.lower().strip(), mapped_type))
    conn.commit(); cur.close(); conn.close()


@app.post("/api/analyze-csv")
async def analyze_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    contents = await file.read()
    filename = (file.filename or "upload.csv").lower()
    try:
        df = _read_any_csv(contents, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty or unreadable")

    stored = _get_stored_mappings(current_user["id"])
    result = analyze_csv_structure(df, stored_mappings=stored if stored else None)
    result["total_rows"] = len(df)
    return result


@app.post("/api/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    date_col: Optional[str] = Form(None),
    amount_col: Optional[str] = Form(None),
    description_col: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    contents = await file.read()
    filename = (file.filename or "upload.csv").lower()
    
    try:
        df = _read_any_csv(contents, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty")

    mapping = {
        "date": date_col or None,
        "amount": amount_col or None,
        "description": description_col or None,
    }

    # Validate columns exist
    for field, col in mapping.items():
        if col and col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found in file")

    # Self-learning: store confirmed mappings
    user_id = int(current_user["id"])
    for field, col in mapping.items():
        if col:
            _store_mapping(user_id, col, field)

    normalized_rows, errors = process_with_mapping(df, mapping)

    if not normalized_rows:
        return {"transactions": [], "errors": errors, "imported": 0, "skipped": len(errors)}

    # Run categorization
    descriptions = [r["description"] for r in normalized_rows]
    try:
        batch_preds = model.predict_batch(descriptions)
    except AttributeError:
        batch_preds = [model.predict(d) for d in descriptions]

    to_insert = []
    results = []
    for idx, row in enumerate(normalized_rows):
        pred = batch_preds[idx]
        cat = str(pred["category"])
        conf = float(pred["confidence"])
        keys_str = ",".join(str(k) for k in pred.get("keywords", []))
        tx_id = str(uuid.uuid4())
        to_insert.append((tx_id, user_id, row["date"], row["description"], row["amount"], cat, conf, keys_str, "completed"))
        if len(results) < 500:
            results.append({
                "id": tx_id, "date": row["date"], "description": row["description"],
                "amount": row["amount"], "category": cat, "confidence": conf,
                "keywords": keys_str.split(",") if keys_str else []
            })

    conn = get_conn()
    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO transactions (id, user_id, date, description, amount, category, confidence, keywords, status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        to_insert
    )
    conn.commit()

    total_spend = sum(abs(r["amount"]) for r in normalized_rows)
    if total_spend > 5000:
        create_notification(user_id, f"⚠️ High spending detected: ${total_spend:.2f} imported.", "warning")

    cur.close(); conn.close()

    return {
        "transactions": results,
        "errors": errors[:100],
        "imported": len(to_insert),
        "skipped": len(errors),
    }



# ========================
# BANK STATEMENT ANALYZER
# ========================

def _normalize_date(raw: str) -> Optional[str]:
    """Normalize various date formats to YYYY-MM-DD."""
    if not raw:
        return None
    raw = raw.strip()
    formats = [
        "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y",
        "%d/%m/%y", "%m/%d/%y", "%Y/%m/%d",
        "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
        "%d-%b-%Y", "%d-%B-%Y", "%b %d %Y",
        "%Y%m%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Try pandas as last resort
    try:
        parsed = pd.to_datetime(raw, dayfirst=True, errors="coerce")
        if not pd.isna(parsed):
            return parsed.strftime("%Y-%m-%d")
    except Exception:
        pass
    return None


def _clean_amount(raw: str) -> Optional[float]:
    """Parse amount string to float, removing currency symbols and commas."""
    if not raw:
        return None
    cleaned = re.sub(r"[₹$€£,\s]", "", str(raw).strip())
    cleaned = re.sub(r"^\((.+)\)$", r"-\1", cleaned)  # (1234) → -1234
    try:
        return float(cleaned)
    except ValueError:
        return None


def _clean_transaction_name(raw: str) -> str:
    """Remove noise from transaction names: UPI IDs, ref numbers, transaction IDs."""
    if not raw:
        return ""
    # Remove UPI IDs (format: something@something)
    name = re.sub(r'\b[\w.]+@[\w.]+\b', '', raw)
    # Remove long numeric sequences (transaction IDs / ref numbers, 8+ digits)
    name = re.sub(r'\b\d{8,}\b', '', name)
    # Remove common prefixes
    name = re.sub(r'^(UPI[-/]?|NEFT[-/]?|IMPS[-/]?|RTGS[-/]?|ATM[-/]?|POS[-/]?|ACH[-/]?|ECS[-/]?\s*)', '', name, flags=re.IGNORECASE)
    # Remove reference keywords and attached IDs without stripping real merchant words.
    name = re.sub(r'\b(REF|REFNO|UTR|TXN|TRN|RRN|CNR)\b(?:[\s:/#\-]*[A-Z0-9]*\d[A-Z0-9]*)?', '', name, flags=re.IGNORECASE)
    # Collapse whitespace
    name = re.sub(r'[\s/|-]+', ' ', name).strip()
    return name[:120]  # cap length


def _is_debit_row(row_text: str, amount_str: str = "") -> bool:
    """Determine if a transaction line represents a debit (money out)."""
    import re
    text_upper = row_text.upper()
    
    # Explicit credit markers — skip these
    credit_markers = [r"\bCR\b", r"\bCREDIT", r"\bDEPOSIT", r"\bRECEIVED\b", r"\bSALARY\b", r"\bREFUND\b", r"\bCASHBACK\b", r"\bREVERSAL\b"]
    for m in credit_markers:
        if re.search(m, text_upper):
            return False
            
    # Explicit debit markers — accept these
    debit_markers = [r"\bDR\b", r"\bDEBIT", r"\bPAID\b", r"\bWITHDRAWAL\b", r"\bPURCHASE", r"\bATM WDR\b", r"\bCHQ\b", r"\bCHEQUE\b", r"\bUPI\b"]
    for m in debit_markers:
        if re.search(m, text_upper):
            return True
            
    # If amount is explicitly negative with a - sign
    if amount_str.strip().startswith("-"):
        return True
        
    # If neither credit nor debit markers are explicitly present, assume it is a debit (since this is an expense analyzer).
    # False positives (credits without CR) are less common than debits without DR.
    return True


def _extract_debits_from_table(table: list) -> list:
    """Extract debit transactions from a pdfplumber table (list of rows)."""
    if not table or len(table) < 2:
        return []

    header = [str(h).replace('\n', ' ').strip().lower() if h else f"col{i}" for i, h in enumerate(table[0])]

    # Map columns by keyword matching
    date_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["date", "value dt", "txn dt", "posting"])), None)
    desc_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["narration", "description", "particulars", "details", "remark", "transaction", "name", "merchant"])), None)
    debit_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["debit", "dr", "withdrawal", "dr amt", "debit amount"])), None)
    credit_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["credit", "cr", "deposit", "cr amt", "credit amount", "deposit amount"])), None)
    amount_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["amount", "amt", "value"]) and not any(k in h for k in ["dr", "cr", "debit", "credit"])), None)
    type_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["type", "dr/cr", "txn type", "mode"])), None)

    results = []
    for row in table[1:]:
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        row_text = " ".join(str(c) for c in row if c is not None)

        # Extract date
        raw_date = str(row[date_idx]).strip() if date_idx is not None and date_idx < len(row) else ""
        norm_date = _normalize_date(raw_date)

        if not norm_date:
            # Try finding a date anywhere in row
            date_match = re.search(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,-]+\d{2,4})\b', row_text, re.IGNORECASE)
            if date_match:
                norm_date = _normalize_date(date_match.group(1))

        if not norm_date:
            continue
            
        # Check if explicit credit column has value - skip if true
        credit_amount = None
        if credit_idx is not None and credit_idx < len(row):
            credit_amount = _clean_amount(str(row[credit_idx]))
        if credit_amount and credit_amount > 0:
            continue

        # Try dedicated debit column first
        debit_amount = None
        if debit_idx is not None and debit_idx < len(row):
            debit_amount = _clean_amount(str(row[debit_idx]))

        if debit_amount and debit_amount > 0:
            # Has explicit debit column with value
            raw_desc = str(row[desc_idx]).strip() if desc_idx is not None and desc_idx < len(row) else row_text
            name = _clean_transaction_name(raw_desc)
            if not name:
                continue
            results.append({"date": norm_date, "name": name, "amount": round(debit_amount, 2)})
            continue

        # No dedicated debit column — use amount + type/marker logic
        raw_amt = ""
        if amount_idx is not None and amount_idx < len(row):
            raw_amt = str(row[amount_idx])

        amt = _clean_amount(raw_amt)
        if amt is None:
            continue

        type_val = str(row[type_idx]).strip().upper() if type_idx is not None and type_idx < len(row) else ""
        is_debit = False
        if type_val:
            is_debit = any(re.search(r'\b' + k + r'\b', type_val) for k in ["DR", "DEBIT", "D"])
            if any(re.search(r'\b' + k + r'\b', type_val) for k in ["CR", "CREDIT", "C"]):
                is_debit = False
        else:
            is_debit = _is_debit_row(row_text, raw_amt)

        if not is_debit or amt <= 0:
            continue

        raw_desc = str(row[desc_idx]).strip() if desc_idx is not None and desc_idx < len(row) else row_text
        name = _clean_transaction_name(raw_desc)
        if not name:
            continue
        results.append({"date": norm_date, "name": name, "amount": round(abs(amt), 2)})

    return results


def _extract_debits_from_text(text: str) -> list:
    """Extract debit transactions from raw PDF text using regex heuristics."""
    # Date patterns
    DATE_PAT = (
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}'
        r'|\d{4}[/-]\d{2}[/-]\d{2}'
        r'|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.,\-]+\d{2,4}'
        r'|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.,]+\d{1,2}[\s.,]+\d{2,4}'
        r'|\d{8})'
    )
    # Amount pattern: optional currency symbol, digits with commas, optional decimals
    AMOUNT_PAT = r'([₹$€£]?\s*[\d,]+(?:\.\d{1,2})?)'

    results = []
    lines = text.split('\n')

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Skip obvious header/footer lines
        if any(k in line.upper() for k in ["PAGE", "STATEMENT OF ACCOUNT", "ACCOUNT NO", "IFSC", "BRANCH", "OPENING BALANCE", "CLOSING BALANCE", "TOTAL", "BALANCE B/F", "BROUGHT FORWARD"]):
            i += 1
            continue

        date_match = re.search(DATE_PAT, line, re.IGNORECASE)
        if not date_match:
            i += 1
            continue

        norm_date = _normalize_date(date_match.group(1))
        if not norm_date:
            i += 1
            continue

        # Combine with next line for multi-line rows
        combined = line
        if i + 1 < len(lines) and lines[i + 1].strip() and not re.search(DATE_PAT, lines[i + 1], re.IGNORECASE):
            combined = line + " " + lines[i + 1].strip()
            i += 1  # consume next line

        # Find all amounts in the combined row
        amounts = [m for m in re.finditer(AMOUNT_PAT, combined) if m.start() >= date_match.end()]
        if not amounts:
            i += 1
            continue

        # Heuristic: last 1-2 numbers are usually balance + debit/credit
        # We pick the second-to-last (debit amt) if >= 2 numbers, else last
        if len(amounts) >= 2:
            debit_am = amounts[-2]
        else:
            debit_am = amounts[-1]

        amt_str = debit_am.group(1)
        amt = _clean_amount(amt_str)
        if not amt or amt <= 0:
            i += 1
            continue

        # Check debit signal
        if not _is_debit_row(combined, amt_str):
            i += 1
            continue

        # Extract description: text between date and first amount
        desc_start = date_match.end()
        desc_end = amounts[0].start() if amounts else len(combined)
        raw_desc = combined[desc_start:desc_end].strip()
        if not raw_desc:
            raw_desc = combined

        name = _clean_transaction_name(raw_desc)
        if not name:
            i += 1
            continue

        results.append({"date": norm_date, "name": name, "amount": round(amt, 2)})
        i += 1

    return results


@app.post("/api/analyze-statement")
async def analyze_statement(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Analyze a bank statement PDF and extract only DEBIT transactions.
    Returns structured JSON: [{date, name, amount}]
    """
    contents = await file.read()
    filename = (file.filename or "statement").lower()

    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for statement analysis.")

    import pdfplumber

    debit_transactions = []
    skipped_rows = 0
    used_ocr = False
    total_pages = 0

    try:
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            total_pages = len(pdf.pages)
            table_results = []
            text_results = []

            for page in pdf.pages:
                # Strategy 1: Structured table extraction
                tables = page.extract_tables() or []
                for tbl in tables:
                    extracted = _extract_debits_from_table(tbl)
                    table_results.extend(extracted)

                # Strategy 2: Text-based extraction (always run as fallback or complement)
                raw_text = page.extract_text() or ""
                if raw_text.strip():
                    text_results.extend(_extract_debits_from_text(raw_text))

            # Prefer table results if they yielded something, else fall back to text
            if table_results:
                debit_transactions = table_results
                skipped_rows = max(0, len(text_results) - len(table_results))
            elif text_results:
                debit_transactions = text_results
            else:
                used_ocr = True  # Signal to frontend that OCR might help

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")

    # Deduplicate by (date, name, amount)
    seen = set()
    unique_transactions = []
    for tx in debit_transactions:
        key = (tx["date"], tx["name"][:30], tx["amount"])
        if key not in seen:
            seen.add(key)
            unique_transactions.append(tx)

    # Sort by date descending
    unique_transactions.sort(key=lambda x: x["date"], reverse=True)

    return {
        "transactions": unique_transactions,
        "summary": {
            "total_debit_transactions": len(unique_transactions),
            "skipped_rows": skipped_rows,
            "total_pages": total_pages,
            "used_ocr": used_ocr,
            "extraction_method": "table" if debit_transactions and not used_ocr else "text",
        }
    }


@app.post("/api/save-debit-transactions")
async def save_debit_transactions(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Save confirmed debit transactions to the database as expenses."""
    transactions = body.get("transactions", [])
    if not transactions:
        raise HTTPException(status_code=400, detail="No transactions provided")

    user_id = int(current_user["id"])
    to_insert = []
    results = []
    
    # Process AI predictions
    descriptions = [str(tx.get("name", "Debit Transaction"))[:255] for tx in transactions]
    try:
        batch_preds = model.predict_batch(descriptions)
    except AttributeError:
        batch_preds = [model.predict(d) for d in descriptions]

    for idx, tx in enumerate(transactions):
        tx_id = str(uuid.uuid4())
        date_str = tx.get("date", datetime.now().strftime("%Y-%m-%d"))
        name = descriptions[idx]
        amount = float(tx.get("amount", 0))
        if amount <= 0:
            continue
        
        # Determine category using AI predictions instead of hardcoding
        pred = batch_preds[idx]
        cat = str(pred["category"])
        if cat in ["Income", "Salary"]:  # Defaulting debits to correct side
            cat = "Other"
        conf = float(pred["confidence"])
        keys_str = ",".join(str(k) for k in pred.get("keywords", []))
        
        to_insert.append((tx_id, user_id, date_str, name, amount, cat, conf, keys_str, "completed"))
        results.append({"id": tx_id, "date": date_str, "description": name, "amount": amount, "category": cat})

    if not to_insert:
        raise HTTPException(status_code=400, detail="No valid transactions to save")

    conn = get_conn()
    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO transactions (id, user_id, date, description, amount, category, confidence, keywords, status) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        to_insert
    )
    conn.commit()
    cur.close()
    conn.close()

    create_notification(
        user_id,
        f"✅ {len(to_insert)} debit transaction(s) saved from bank statement.",
        "success"
    )

    return {"saved": len(to_insert), "transactions": results}


@app.get("/")
def health():
    return {"status": "SpendSense API is running"}
