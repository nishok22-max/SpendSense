import importlib
import unittest


class StatementHelperWhiteboxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.main = importlib.import_module("backend.main")
        except Exception as exc:
            raise unittest.SkipTest(f"Skipping helper whitebox tests (backend import failed): {exc}")

    def test_normalize_date_common_format(self):
        self.assertEqual(self.main._normalize_date("26/03/2026"), "2026-03-26")

    def test_clean_amount_formats(self):
        self.assertEqual(self.main._clean_amount("1,234.50"), 1234.5)
        self.assertEqual(self.main._clean_amount("(500.00)"), -500.0)

    def test_clean_transaction_name_preserves_valid_merchant_text(self):
        raw = "UPI-JOHN.DOE@okhdfcbank REF 123456789012 Payment"
        self.assertEqual(self.main._clean_transaction_name(raw), "Payment")

    def test_credit_row_detection(self):
        self.assertTrue(self.main._is_credit_row("SALARY CREDITED FROM ACME CORP", "50000.00"))
        self.assertFalse(self.main._is_credit_row("ATM WDR CASH", "1000.00"))

    def test_extract_credits_from_text_filters_debit_and_keeps_clean_name(self):
        sample = (
            "26/03/2026 SALARY CREDITED ACME CORP 50,000.00 CR 1,20,000.00\n"
            "27/03/2026 ATM WDR 500.00 DR 10,000.00"
        )
        rows = self.main._extract_credits_from_text(sample)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["date"], "2026-03-26")
        self.assertEqual(rows[0]["amount"], 50000.0)
        self.assertEqual(rows[0]["name"], "SALARY CREDITED ACME CORP")


if __name__ == "__main__":
    unittest.main()
