"""GST tax invoices and the billing details that go on them.

Pure functions: no database, no network. calls_db stores the data, token_api serves the page.

The supplier's legal details come from the environment, not from code, because they are the
company's and must be right on a tax document: INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_GSTIN,
INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_STATE (state name), INVOICE_SAC. A line whose setting
is empty is left off the invoice instead of being filled with a guess.
"""
import datetime
import html
import os
import re

GST_RATE = 0.18
_GSTIN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

KIND_LABELS = {
    "subscription": "Vistrow Voice subscription",
    "topup": "Credit top-up",
    "overage": "Usage beyond included credits",
    "phone_number": "Phone number rental",
}


def normalize_profile(data: dict) -> dict:
    """Clean and validate the customer's billing details. Raises ValueError with a message
    fit to show the user."""
    def clean(key: str, limit: int) -> str:
        return " ".join(str(data.get(key) or "").split())[:limit]

    profile = {
        "legal_name": clean("legalName", 200),
        "gstin": clean("gstin", 15).upper().replace(" ", ""),
        "address": str(data.get("address") or "").strip()[:500],
        "city": clean("city", 100),
        "state": clean("state", 100),
        "pincode": clean("pincode", 10),
        "billing_email": clean("billingEmail", 200).lower(),
    }
    if profile["gstin"] and not _GSTIN.match(profile["gstin"]):
        raise ValueError("That GSTIN does not look right. It has 15 characters, for example 27ABCDE1234F1Z5.")
    if profile["pincode"] and not re.match(r"^[0-9]{6}$", profile["pincode"]):
        raise ValueError("The pincode must be 6 digits.")
    if profile["billing_email"] and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", profile["billing_email"]):
        raise ValueError("That billing email does not look right.")
    return profile


def financial_year(when: datetime.datetime) -> str:
    """India's financial year runs April to March: 2026-10-08 is FY 2026-27."""
    start = when.year if when.month >= 4 else when.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def invoice_number(fy: str, sequence: int) -> str:
    return f"VV/{fy}/{sequence:05d}"


def parse_when(value) -> datetime.datetime:
    if isinstance(value, datetime.datetime):
        return value
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.datetime.now(datetime.timezone.utc)


def supplier_from_env(env=None) -> dict:
    env = os.environ if env is None else env
    return {
        "name": env.get("INVOICE_SUPPLIER_NAME", "").strip() or "Vistrow",
        "gstin": env.get("INVOICE_SUPPLIER_GSTIN", "").strip().upper(),
        "address": env.get("INVOICE_SUPPLIER_ADDRESS", "").strip(),
        "state": env.get("INVOICE_SUPPLIER_STATE", "").strip(),
        "sac": env.get("INVOICE_SAC", "").strip(),
    }


def tax_split(total_inr: float, gst_inr: float, supplier_state: str, customer_state: str) -> dict:
    """Base amount and the tax lines. Same state on both sides: CGST + SGST halves. Different or
    unknown state: IGST (the safe default for an online service)."""
    total = round(float(total_inr or 0), 2)
    gst = round(float(gst_inr or 0), 2)
    base = round(total - gst, 2)
    same_state = bool(supplier_state and customer_state and supplier_state.strip().lower() == customer_state.strip().lower())
    if gst <= 0:
        lines = []
    elif same_state:
        half = round(gst / 2, 2)
        lines = [("CGST (9%)", half), ("SGST (9%)", round(gst - half, 2))]
    else:
        lines = [("IGST (18%)", gst)]
    return {"base": base, "lines": lines, "total": total}


def _inr(value: float) -> str:
    return f"₹{value:,.2f}"


def render_invoice_html(invoice: dict, profile: dict | None, supplier: dict, account_name: str, auto_print: bool = False) -> str:
    esc = html.escape
    profile = profile or {}
    paid_at = parse_when(invoice.get("paid_at") or invoice.get("created_at"))
    tax = tax_split(invoice.get("amount_inr"), invoice.get("gst_inr"), supplier.get("state", ""), profile.get("state", ""))
    label = KIND_LABELS.get(invoice.get("kind"), "Vistrow Voice")
    if invoice.get("kind") == "topup" and invoice.get("credits"):
        label += f" ({int(invoice['credits'])} credits)"
    period = ""
    if invoice.get("period_start") and invoice.get("period_end"):
        period = f"<div class=\"muted\">Service period: {esc(str(invoice['period_start'])[:10])} to {esc(str(invoice['period_end'])[:10])}</div>"
    sac = f"<div class=\"muted\">SAC: {esc(supplier['sac'])}</div>" if supplier.get("sac") else ""
    bill_to_name = profile.get("legal_name") or account_name
    bill_to_lines = [esc(bill_to_name)]
    for key in ("address", "city", "state", "pincode"):
        if profile.get(key):
            bill_to_lines.append(esc(profile[key]).replace("\n", "<br>"))
    if profile.get("gstin"):
        bill_to_lines.append(f"GSTIN: {esc(profile['gstin'])}")
    supplier_lines = [f"<strong>{esc(supplier['name'])}</strong>"]
    if supplier.get("address"):
        supplier_lines.append(esc(supplier["address"]).replace("\n", "<br>"))
    if supplier.get("gstin"):
        supplier_lines.append(f"GSTIN: {esc(supplier['gstin'])}")
    tax_rows = "".join(f"<tr><td colspan=\"2\" class=\"right\">{esc(name)}</td><td class=\"right\">{_inr(amount)}</td></tr>" for name, amount in tax["lines"])
    number = invoice.get("invoice_number") or f"Receipt {invoice.get('id')}"
    print_js = "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>" if auto_print else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax invoice {esc(number)}</title>
<style>
  body{{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1523;margin:0;background:#f4f2f9}}
  .page{{max-width:760px;margin:24px auto;background:#fff;padding:40px;border:1px solid #e4ddf0;border-radius:12px}}
  h1{{font-size:22px;margin:0 0 4px}} .muted{{color:#6b6480;font-size:12px}}
  .head{{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:28px}}
  .box{{min-width:240px}} .label{{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b6480;margin-bottom:4px}}
  table{{width:100%;border-collapse:collapse;margin-top:8px}} th{{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b6480;border-bottom:1px solid #e4ddf0;padding:8px 0}}
  td{{padding:10px 0;border-bottom:1px solid #f0ecf7;vertical-align:top}} .right{{text-align:right}} .total td{{font-weight:700;font-size:16px;border-bottom:0}}
  .paid{{display:inline-block;padding:2px 10px;border-radius:99px;background:#e3f7f0;color:#0e8f6f;font-size:12px;font-weight:700}}
  .actions{{max-width:760px;margin:16px auto 0;text-align:right}} button{{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #cfc6e4;background:#fff;cursor:pointer}}
  @media print{{body{{background:#fff}} .page{{margin:0;border:0;border-radius:0;max-width:none}} .actions{{display:none}}}}
</style></head><body>
<div class="actions"><button onclick="window.print()">Print or save as PDF</button></div>
<div class="page">
  <div class="head">
    <div><h1>Tax invoice</h1><div class="muted">Invoice no. {esc(number)}</div><div class="muted">Date: {paid_at.strftime('%d %b %Y')}</div><div style="margin-top:8px"><span class="paid">Paid</span></div></div>
    <div class="box">{'<br>'.join(supplier_lines)}</div>
  </div>
  <div class="box" style="margin-bottom:24px"><div class="label">Billed to</div>{'<br>'.join(bill_to_lines)}</div>
  <table>
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
    <tbody>
      <tr><td>{esc(label)}{period}{sac}</td><td class="right">1</td><td class="right">{_inr(tax['base'])}</td></tr>
      {tax_rows}
      <tr class="total"><td colspan="2" class="right">Total (INR)</td><td class="right">{_inr(tax['total'])}</td></tr>
    </tbody>
  </table>
  <p class="muted" style="margin-top:24px">This is a computer-generated invoice. Payment reference: {esc(str(invoice.get('razorpay_payment_id') or '-'))}.</p>
</div>
{print_js}
</body></html>"""
