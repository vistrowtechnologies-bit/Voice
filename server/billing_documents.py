"""GST tax invoices and the billing details that go on them.

Pure functions: no database, no network. calls_db stores the data, token_api serves the page.

The supplier's legal details come from the environment, not from code, because they are the
company's and must be right on a tax document: INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_GSTIN,
INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_STATE (state name), INVOICE_SAC. A line whose setting
is empty is left off the invoice instead of being filled with a guess.
"""
import base64
import datetime
import html
import io
import os
import re
from functools import lru_cache

# A4 print layout for both the HTML page and the PDF.
PAGE_W_MM, PAGE_H_MM, MARGIN_MM = 210, 297, 16
_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "invoice-logo.png")


@lru_cache(maxsize=1)
def logo_png() -> bytes:
    """The Vistrow wordmark embedded in every invoice (empty if the asset is missing)."""
    try:
        with open(_LOGO_PATH, "rb") as f:
            return f.read()
    except OSError:
        return b""

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
    bonus = int(invoice.get("bonus_credits") or 0) if invoice.get("kind") == "topup" else 0
    bonus_row = (
        f"<tr><td>Bonus credits ({bonus} credits)<div class=\"muted\">Included free with this pack</div></td>"
        f"<td class=\"right\">1</td><td class=\"right\">{_inr(0)}</td></tr>"
        if bonus else ""
    )
    logo = logo_png()
    logo_html = (
        f"<img class=\"logo\" src=\"data:image/png;base64,{base64.b64encode(logo).decode()}\" alt=\"Vistrow\">"
        if logo else ""
    )
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
  .actions{{max-width:760px;margin:16px auto 0;text-align:right;display:flex;gap:8px;justify-content:flex-end}} button,.actions a{{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #cfc6e4;background:#fff;cursor:pointer;color:#1a1523;text-decoration:none}}
  .actions a.primary{{background:#9333ea;border-color:#9333ea;color:#fff;font-weight:600}}
  .logo{{height:40px;width:auto;display:block;margin-bottom:14px}}
  @page{{size:A4;margin:{MARGIN_MM}mm}}
  @media print{{body{{background:#fff}} .page{{margin:0;border:0;border-radius:0;max-width:none;padding:0;width:{PAGE_W_MM - 2 * MARGIN_MM}mm}} .actions{{display:none}}}}
</style></head><body>
<div class="actions"><a class="primary" href="pdf" download>Download PDF</a><button onclick="window.print()">Print</button></div>
<div class="page">
  <div class="head">
    <div>{logo_html}<h1>Tax invoice</h1><div class="muted">Invoice no. {esc(number)}</div><div class="muted">Date: {paid_at.strftime('%d %b %Y')}</div><div style="margin-top:8px"><span class="paid">Paid</span></div></div>
    <div class="box">{'<br>'.join(supplier_lines)}</div>
  </div>
  <div class="box" style="margin-bottom:24px"><div class="label">Billed to</div>{'<br>'.join(bill_to_lines)}</div>
  <table>
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
    <tbody>
      <tr><td>{esc(label)}{period}{sac}</td><td class="right">1</td><td class="right">{_inr(tax['base'])}</td></tr>
      {bonus_row}
      {tax_rows}
      <tr class="total"><td colspan="2" class="right">Total (INR)</td><td class="right">{_inr(tax['total'])}</td></tr>
    </tbody>
  </table>
  <p class="muted" style="margin-top:24px">This is a computer-generated invoice. Payment reference: {esc(str(invoice.get('razorpay_payment_id') or '-'))}.</p>
</div>
{print_js}
</body></html>"""


def render_invoice_pdf(invoice: dict, profile: dict | None, supplier: dict, account_name: str) -> bytes:
    """The same invoice as an A4 PDF (reportlab), for the Download PDF button
    and email attachments. Mirrors render_invoice_html line for line."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    profile = profile or {}
    paid_at = parse_when(invoice.get("paid_at") or invoice.get("created_at"))
    tax = tax_split(invoice.get("amount_inr"), invoice.get("gst_inr"), supplier.get("state", ""), profile.get("state", ""))
    label = KIND_LABELS.get(invoice.get("kind"), "Vistrow Voice")
    if invoice.get("kind") == "topup" and invoice.get("credits"):
        label += f" ({int(invoice['credits'])} credits)"
    bonus = int(invoice.get("bonus_credits") or 0) if invoice.get("kind") == "topup" else 0
    number = invoice.get("invoice_number") or f"Receipt {invoice.get('id')}"
    page_w, page_h = A4
    left, right = MARGIN_MM * mm, page_w - MARGIN_MM * mm
    ink, muted, rule = (0.10, 0.08, 0.14), (0.42, 0.39, 0.50), (0.89, 0.87, 0.94)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Tax invoice {number}")
    c.setAuthor(supplier.get("name") or "Vistrow")
    # Register a font that has the rupee sign; Helvetica does not.
    font, bold = "Helvetica", "Helvetica-Bold"
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        # DejaVu ships in the Docker image (fonts-dejavu-core); Georgia is
        # only for local previews on a Mac. Both have U+20B9.
        for regular, strong, name in (
            ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVu"),
            ("/System/Library/Fonts/Supplemental/Georgia.ttf", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf", "Georgia"),
        ):
            if os.path.exists(regular):
                pdfmetrics.registerFont(TTFont(name, regular))
                pdfmetrics.registerFont(TTFont(name + "-Bold", strong))
                font, bold = name, name + "-Bold"
                break
    except Exception:
        pass
    rupee = "₹" if font != "Helvetica" else "Rs. "

    def money(v: float) -> str:
        return f"{rupee}{v:,.2f}"

    y = page_h - MARGIN_MM * mm
    logo = logo_png()
    if logo:
        img = ImageReader(io.BytesIO(logo))
        iw, ih = img.getSize()
        h = 12 * mm
        c.drawImage(img, left, y - h, width=h * iw / ih, height=h, mask="auto")
        y -= h + 6 * mm
    c.setFillColorRGB(*ink)
    c.setFont(bold, 18)
    c.drawString(left, y, "Tax invoice")
    c.setFont(font, 9)
    c.setFillColorRGB(*muted)
    c.drawString(left, y - 6 * mm, f"Invoice no. {number}")
    c.drawString(left, y - 10.5 * mm, f"Date: {paid_at.strftime('%d %b %Y')}")
    c.setFillColorRGB(0.05, 0.56, 0.44)
    c.drawString(left, y - 15.5 * mm, "PAID")

    # Supplier block, right-aligned at the top.
    sy = y
    c.setFillColorRGB(*ink)
    c.setFont(bold, 10)
    c.drawRightString(right, sy, supplier.get("name") or "Vistrow")
    c.setFont(font, 9)
    for line in [ln for ln in (supplier.get("address") or "").split("\n") if ln.strip()] + (
        [f"GSTIN: {supplier['gstin']}"] if supplier.get("gstin") else []
    ):
        sy -= 4.5 * mm
        c.drawRightString(right, sy, line.strip())

    y -= 26 * mm
    c.setFont(font, 7.5)
    c.setFillColorRGB(*muted)
    c.drawString(left, y, "BILLED TO")
    y -= 5 * mm
    c.setFont(font, 10)
    c.setFillColorRGB(*ink)
    for line in [profile.get("legal_name") or account_name] + [
        profile[k] for k in ("address", "city", "state", "pincode") if profile.get(k)
    ] + ([f"GSTIN: {profile['gstin']}"] if profile.get("gstin") else []):
        for part in str(line).split("\n"):
            c.drawString(left, y, part)
            y -= 4.8 * mm

    # Line items.
    y -= 6 * mm
    qty_x, amt_x = right - 40 * mm, right
    c.setFont(font, 7.5)
    c.setFillColorRGB(*muted)
    c.drawString(left, y, "DESCRIPTION")
    c.drawRightString(qty_x, y, "QTY")
    c.drawRightString(amt_x, y, "AMOUNT")
    y -= 2.5 * mm
    c.setStrokeColorRGB(*rule)
    c.line(left, y, right, y)

    def row(desc: str, sub: str, qty: str, amount: str, strong: bool = False, size: float = 10):
        nonlocal y
        y -= 7 * mm
        c.setFillColorRGB(*ink)
        c.setFont(bold if strong else font, size)
        if desc:
            c.drawString(left, y, desc)
        if qty:
            c.drawRightString(qty_x, y, qty)
        c.drawRightString(amt_x, y, amount)
        if sub:
            y -= 4 * mm
            c.setFont(font, 8)
            c.setFillColorRGB(*muted)
            c.drawString(left, y, sub)
        y -= 2.5 * mm
        c.setStrokeColorRGB(*rule)
        c.line(left, y, right, y)

    sub = ""
    if invoice.get("period_start") and invoice.get("period_end"):
        sub = f"Service period: {str(invoice['period_start'])[:10]} to {str(invoice['period_end'])[:10]}"
    if supplier.get("sac"):
        sub = (sub + "   " if sub else "") + f"SAC: {supplier['sac']}"
    row(label, sub, "1", money(tax["base"]))
    if bonus:
        row(f"Bonus credits ({bonus} credits)", "Included free with this pack", "1", money(0))
    for name, amount in tax["lines"]:
        y -= 7 * mm
        c.setFont(font, 10)
        c.setFillColorRGB(*ink)
        c.drawRightString(qty_x, y, name)
        c.drawRightString(amt_x, y, money(amount))
        y -= 2.5 * mm
        c.line(left, y, right, y)
    y -= 8 * mm
    c.setFont(bold, 12)
    c.drawRightString(qty_x, y, "Total (INR)")
    c.drawRightString(amt_x, y, money(tax["total"]))

    c.setFont(font, 8)
    c.setFillColorRGB(*muted)
    c.drawString(left, MARGIN_MM * mm + 6 * mm,
                 f"This is a computer-generated invoice. Payment reference: {invoice.get('razorpay_payment_id') or '-'}.")
    c.showPage()
    c.save()
    return buf.getvalue()


def receipt_email(invoice: dict, profile: dict | None, supplier: dict, account_name: str) -> dict:
    """What the payment receipt email says, plus the invoice PDF to attach.
    Returns {subject, preheader, heading, body_html, attachments} for
    email_sender.render_email / send_email. Pure: the caller fetches rows."""
    esc = html.escape
    profile = profile or {}
    tax = tax_split(invoice.get("amount_inr"), invoice.get("gst_inr"), supplier.get("state", ""), profile.get("state", ""))
    paid_at = parse_when(invoice.get("paid_at") or invoice.get("created_at"))
    number = invoice.get("invoice_number") or f"Receipt {invoice.get('id')}"
    kind = invoice.get("kind")
    label = KIND_LABELS.get(kind, "Vistrow Voice")
    credits = int(invoice.get("credits") or 0) if kind == "topup" else 0
    bonus = int(invoice.get("bonus_credits") or 0) if kind == "topup" else 0
    if credits:
        label += f" ({credits} credits)"
    granted = credits + bonus

    def row(name: str, amount: str, strong: bool = False) -> str:
        weight = "font-weight:700;" if strong else ""
        return (f"<tr><td style=\"padding:6px 0;{weight}\">{name}</td>"
                f"<td style=\"padding:6px 0;text-align:right;white-space:nowrap;{weight}\">{amount}</td></tr>")

    rows = [row(esc(label), _inr(tax["base"]))]
    if bonus:
        rows.append(row(f"Bonus credits ({bonus} credits) <span style=\"color:#625a73\">included free</span>", _inr(0)))
    rows += [row(esc(name), _inr(amount)) for name, amount in tax["lines"]]
    rows.append(row("Total paid", _inr(tax["total"]), strong=True))
    table = (
        "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" style=\"width:100%;border-collapse:collapse;font-size:14px\">"
        + "".join(rows) + "</table>"
    )
    headline = (
        f"<strong>{granted} credits</strong> have been added to <strong>{esc(account_name)}</strong> and are ready to use."
        if granted else f"Thanks, your payment for {esc(label)} is confirmed."
    )
    meta = (
        f"<p style=\"color:#625a73;font-size:13px;margin:16px 0 8px\">Invoice {esc(number)} · {paid_at.strftime('%d %b %Y')}"
        + (f" · Billed to {esc(profile['legal_name'])}" if profile.get("legal_name") else "")
        + (f" · GSTIN {esc(profile['gstin'])}" if profile.get("gstin") else "") + "</p>"
    )
    footer = (
        f"<p style=\"color:#625a73;font-size:13px;margin-top:16px\">Payment reference {esc(str(invoice.get('razorpay_payment_id') or '-'))}. "
        "The GST invoice is attached as a PDF and stays available under Plan &amp; billing → Payment history.</p>"
    )
    pdf = render_invoice_pdf(invoice, profile, supplier, account_name)
    filename = str(number).replace("/", "-") + ".pdf"
    return {
        "subject": f"Receipt {number} · {_inr(tax['total'])} · Vistrow Voice",
        "preheader": f"{granted} credits added" if granted else f"Payment of {_inr(tax['total'])} confirmed",
        "heading": "Payment received",
        "body_html": f"<p>{headline}</p>{meta}{table}{footer}",
        "attachments": [{"filename": filename, "content": base64.b64encode(pdf).decode(), "contentType": "application/pdf"}],
    }
