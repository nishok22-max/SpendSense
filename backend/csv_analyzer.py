import difflib
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pandas as pd

KEYWORDS: Dict[str, List[str]] = {
    "amount": [
        "amount", "amt", "total", "price", "debit", "credit", "value",
        "sum", "cost", "balance", "dr", "cr", "withdrawal", "deposit",
        "net", "gross", "charge", "fee", "payment", "transaction",
        "withdrawl", "paid", "spent",
    ],
    "date": [
        "date", "time", "timestamp", "txn_date", "created",
        "posted", "transaction_date", "trans_date", "booking_date",
        "value_date", "effective_date", "entry_date", "trn_date",
        "value date", "post date", "posting date",
    ],
    "description": [
        "description", "desc", "details", "remarks", "note",
        "narration", "particulars", "memo", "merchant", "name",
        "title", "beneficiary", "payee", "reference", "narrative",
    ],
    "category": [
        "category", "cat", "type", "group", "label", "tag", "classification",
    ],
}

DATE_PATTERNS = [
    r"^\d{4}-\d{2}-\d{2}",
    r"^\d{2}/\d{2}/\d{4}",
    r"^\d{2}-\d{2}-\d{4}",
    r"^\d{1,2}/\d{1,2}/\d{2,4}",
    r"^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}",
    r"^\d{4}/\d{2}/\d{2}",
    r"^\d{8}$",
    r"^\d{2}\.\d{2}\.\d{4}$",
]

AMOUNT_CLEAN = re.compile(r"[₹$€£¥,\s]")
AMOUNT_PAREN = re.compile(r"^\((.+)\)$")


CURRENCY_STRIP = re.compile(r'[₹$€£¥\s]')


def _normalize_col_name(col_name: str) -> str:
    """Strip currency symbols, normalize separators for matching."""
    name = CURRENCY_STRIP.sub(" ", col_name)
    return name.lower().replace("_", " ").replace("-", " ").strip()


def _name_score(col_name: str, field_type: str) -> float:
    col_clean = _normalize_col_name(col_name)
    best = 0.0
    for kw in KEYWORDS[field_type]:
        if kw == col_clean or kw in col_clean.split() or col_clean in kw:
            return 1.0
        ratio = difflib.SequenceMatcher(None, col_clean, kw).ratio()
        best = max(best, ratio)
    return round(best, 4)


def _date_score(values: list) -> float:
    hits, total = 0, 0
    for v in values:
        if v is None or (isinstance(v, float) and v != v):
            continue
        s = str(v).strip()
        if not s:
            continue
        total += 1
        matched = any(re.match(p, s) for p in DATE_PATTERNS)
        if not matched:
            try:
                pd.to_datetime(s)
                matched = True
            except Exception:
                pass
        if matched:
            hits += 1
    return round(hits / total, 4) if total > 0 else 0.0


def _amount_score(values: list) -> float:
    hits, total = 0, 0
    for v in values:
        if v is None or (isinstance(v, float) and v != v):
            continue
        if isinstance(v, (int, float)):
            total += 1
            hits += 1
            continue
        s = str(v).strip()
        if not s:
            continue
        total += 1
        s = AMOUNT_PAREN.sub(r"-\1", s)
        s = AMOUNT_CLEAN.sub("", s)
        try:
            float(s)
            hits += 1
        except ValueError:
            pass
    return round(hits / total, 4) if total > 0 else 0.0


def _text_score(values: list) -> float:
    hits, total = 0, 0
    for v in values:
        if v is None or (isinstance(v, float) and v != v):
            continue
        s = str(v).strip()
        if not s:
            continue
        total += 1
        if len(s) > 3 and re.search(r"[A-Za-z]", s):
            hits += 1
    return round(hits / total, 4) if total > 0 else 0.0


def classify_column(col_name: str, values: list) -> Dict:
    pattern_scorers = {
        "date":        _date_score,
        "amount":      _amount_score,
        "description": _text_score,
        "category":    _text_score,
    }
    scores: Dict[str, float] = {}
    for ft in ("date", "amount", "description", "category"):
        ns = _name_score(col_name, ft)
        ps = pattern_scorers[ft](values)
        scores[ft] = round(ns * 0.55 + ps * 0.45, 4)

    best_type = max(scores, key=scores.get)
    best_score = scores[best_type]
    return {
        "column": col_name,
        "detected_type": best_type if best_score >= 0.25 else "unknown",
        "confidence": best_score,
        "scores": scores,
    }


def analyze_csv_structure(df: pd.DataFrame, stored_mappings: Dict[str, str] | None = None) -> Dict:
    sample: Dict[str, list] = {col: df[col].dropna().head(30).tolist() for col in df.columns}
    classifications: Dict[str, Dict] = {}

    for col in df.columns:
        info = classify_column(col, sample[col])
        if stored_mappings:
            col_key = col.lower().strip()
            if col_key in stored_mappings:
                stored_type = stored_mappings[col_key]
                info["scores"][stored_type] = min(1.0, info["scores"].get(stored_type, 0) + 0.45)
                info["detected_type"] = stored_type
                info["confidence"] = info["scores"][stored_type]
                info["from_learning"] = True
        classifications[col] = info

    mapping: Dict[str, Optional[str]] = {"date": None, "amount": None, "description": None}
    used: set = set()

    for field_type in ("amount", "date", "description"):
        candidates = [
            (col, info)
            for col, info in classifications.items()
            if info["detected_type"] == field_type and col not in used
        ]
        if not candidates:
            continue
        
        if field_type == "amount" and len(candidates) > 1:
            # Prefer explicit debit/withdrawal columns over balance/credit
            def debit_priority(item):
                col_norm = _normalize_col_name(item[0])
                if any(k in col_norm for k in ["debit", "dr", "withdrawal", "paid", "spent"]):
                    return (2, item[1]["confidence"])
                if any(k in col_norm for k in ["balance", "credit", "cr", "deposit"]):
                    return (0, item[1]["confidence"])
                return (1, item[1]["confidence"])
            best = max(candidates, key=debit_priority)
        else:
            best = max(candidates, key=lambda x: x[1]["confidence"])
        
        mapping[field_type] = best[0]
        used.add(best[0])

    filled = [v for v in mapping.values() if v]
    avg_conf = (
        sum(classifications[c]["confidence"] for c in filled) / len(filled)
        if filled else 0.0
    )
    needs_review = avg_conf < 0.55 or any(v is None for v in mapping.values())

    return {
        "columns": list(df.columns),
        "classifications": classifications,
        "mapping": mapping,
        "overall_confidence": round(avg_conf, 3),
        "needs_review": needs_review,
        "preview": df.head(8).fillna("").astype(str).to_dict(orient="records"),
    }


def normalize_date(raw: str) -> str:
    try:
        return pd.to_datetime(raw).strftime("%Y-%m-%d")
    except Exception:
        return raw


def normalize_amount(raw) -> Optional[float]:
    if isinstance(raw, (int, float)):
        v = float(raw)
        return None if v != v else v
    s = str(raw).strip()
    s = AMOUNT_PAREN.sub(r"-\1", s)
    s = AMOUNT_CLEAN.sub("", s).replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def process_with_mapping(
    df: pd.DataFrame,
    mapping: Dict[str, str],
) -> Tuple[List[Dict], List[Dict]]:
    date_col = mapping.get("date")
    amt_col = mapping.get("amount")
    desc_col = mapping.get("description")

    # Detect if the selected amount column is a debit-specific column
    # In that case, empty/zero values mean it's a credit row — skip silently
    is_debit_col = False
    if amt_col:
        col_norm = CURRENCY_STRIP.sub(" ", amt_col).lower().strip()
        is_debit_col = any(k in col_norm for k in ["debit", "dr", "withdrawal", "paid"])

    rows_out: List[Dict] = []
    errors: List[Dict] = []

    for i, row in enumerate(df.to_dict(orient="records"), start=2):
        desc_raw = str(row.get(desc_col, "")).strip() if desc_col else ""
        date_raw = str(row.get(date_col, "")).strip() if date_col else ""
        amt_raw = row.get(amt_col) if amt_col else None

        amount = normalize_amount(amt_raw)
        
        # If a row has neither a valid date nor a valid amount, it is almost certainly 
        # a PDF table overflow line or empty filler. Skip silently.
        if amount is None and (not date_raw or date_raw.lower() in ("nan", "none", "")):
            continue

        if not desc_raw or desc_raw.lower() in ("nan", "none", ""):
            errors.append({"row": i, "issue": "Missing description"})
            continue

        if amount is None:
            if is_debit_col:
                # Empty debit = credit row, skip silently without counting as error
                continue
            errors.append({"row": i, "issue": f"Invalid amount: {amt_raw}"})
            continue
        if amount == 0.0:
            if is_debit_col:
                continue  # credit row (zero debit), skip silently
            errors.append({"row": i, "issue": "Zero amount skipped"})
            continue

        norm_date = normalize_date(date_raw) if date_raw and date_raw.lower() not in ("nan", "none", "") else datetime.now().strftime("%Y-%m-%d")
        rows_out.append({"date": norm_date, "description": desc_raw, "amount": abs(amount)})

    return rows_out, errors
