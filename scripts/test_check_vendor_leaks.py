import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_vendor_leaks as c  # noqa: E402

ALLOW = c.load_allowlist(Path(__file__).with_name("vendor_leak_allowlist.txt"))


def test_internal_ids_are_always_reported():
    text = 'value:`sarvam/sarvam-105b-conversations`,v:`elevenlabs:abc`,m:`gemini-live:gemini-3.8-live`'
    ids, _ = c.scan_text(text, ALLOW)
    assert len(ids) == 4  # gemini-live and gemini-3.8-live both count


def test_neutral_labels_pass():
    ids, names = c.scan_text('label:`Vistrow Bharat`,tag:`Vistrow Live`', ALLOW)
    assert ids == [] and names == []


def test_vendor_name_flagged_unless_allowlisted():
    _, names = c.scan_text('tag:`lowest OpenAI cost`', ALLOW)
    assert len(names) == 1
    _, names = c.scan_text('description:`Compare Vistrow Voice with Sarvam AI for teams`', ALLOW)
    assert names == []


def test_report_only_by_default(tmp_path):
    (tmp_path / "a.js").write_text("x=`sarvam4:anushka`")
    assert c.main([str(tmp_path)]) == 0
    assert c.main([str(tmp_path), "--strict"]) == 1
    (tmp_path / "a.js").write_text("x=`Vistrow HD`")
    assert c.main([str(tmp_path), "--strict"]) == 0
