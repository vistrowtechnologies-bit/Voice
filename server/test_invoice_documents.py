"""The GST invoice: branded, A4, with the bonus line, as HTML and as a PDF."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import billing_documents as bd

INVOICE = {"id": 7, "kind": "topup", "credits": 500, "bonus_credits": 50, "amount_inr": 3540.0, "gst_inr": 540.0,
           "status": "paid", "paid_at": "2026-10-11 09:30:00", "invoice_number": "VV/2026-27/00007",
           "razorpay_payment_id": "pay_1"}
PROFILE = {"legal_name": "Acme Realty LLP", "gstin": "27ABCDE1234F1Z5", "address": "12 Baner Road", "city": "Pune",
           "state": "Maharashtra", "pincode": "411045"}
SUPPLIER = {"name": "Vistrow Technologies Pvt. Ltd.", "gstin": "27AAAAA0000A1Z5", "address": "Pune", "state": "Maharashtra", "sac": "998313"}


class InvoiceHtml(unittest.TestCase):
    def test_logo_bonus_line_a4_and_download_link(self):
        html = bd.render_invoice_html(INVOICE, PROFILE, SUPPLIER, "Acme")
        self.assertIn("data:image/png;base64,", html, "logo is embedded, not linked")
        self.assertIn("Bonus credits (50 credits)", html)
        self.assertIn("Included free with this pack", html)
        self.assertIn("size:A4", html)
        self.assertIn('href="pdf"', html)
        self.assertIn("CGST (9%)", html)  # same state: split

    def test_no_bonus_line_without_bonus(self):
        html = bd.render_invoice_html({**INVOICE, "bonus_credits": 0}, PROFILE, SUPPLIER, "Acme")
        self.assertNotIn("Bonus credits", html)
        html = bd.render_invoice_html({**INVOICE, "kind": "subscription", "bonus_credits": 50}, PROFILE, SUPPLIER, "Acme")
        self.assertNotIn("Bonus credits", html, "only top-ups carry a bonus")


class ReceiptEmail(unittest.TestCase):
    def test_breakdown_and_pdf_attachment(self):
        import base64
        mail = bd.receipt_email(INVOICE, PROFILE, SUPPLIER, "Acme Realty")
        self.assertEqual(mail["subject"], "Receipt VV/2026-27/00007 · ₹3,540.00 · Vistrow Voice")
        body = mail["body_html"]
        for part in ("550 credits", "Credit top-up (500 credits)", "Bonus credits (50 credits)", "CGST (9%)", "₹270.00",
                     "Total paid", "₹3,540.00", "Invoice VV/2026-27/00007", "GSTIN 27ABCDE1234F1Z5", "pay_1"):
            self.assertIn(part, body, part)
        [att] = mail["attachments"]
        self.assertEqual((att["filename"], att["contentType"]), ("VV-2026-27-00007.pdf", "application/pdf"))
        self.assertTrue(base64.b64decode(att["content"]).startswith(b"%PDF-"))

    def test_subscription_receipt_has_no_credit_lines(self):
        mail = bd.receipt_email({**INVOICE, "kind": "subscription", "credits": 1000, "bonus_credits": 0}, PROFILE, SUPPLIER, "Acme")
        self.assertNotIn("credits</strong> have been added", mail["body_html"])
        self.assertIn("Vistrow Voice subscription", mail["body_html"])


class InvoicePdf(unittest.TestCase):
    def test_is_an_a4_pdf(self):
        pdf = bd.render_invoice_pdf(INVOICE, PROFILE, SUPPLIER, "Acme")
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertIn(b"595.2756 841.8898", pdf, "A4 in points")
        self.assertGreater(len(pdf), 5_000)

    def test_logo_asset_exists(self):
        self.assertTrue(bd.logo_png().startswith(b"\x89PNG"))


if __name__ == "__main__":
    unittest.main()
