import os, sys, types, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _clean_tags():
    # calls_db needs a database at import time; load just the helper's source.
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "calls_db.py")).read()
    start = src.index("def _clean_tags(raw)")
    end = src.index("def create_contact(")
    ns = {}
    exec(src[start:end], ns)
    return ns["_clean_tags"]


class CleanTags(unittest.TestCase):
    def test_trims_spaces_after_commas(self):
        self.assertEqual(_clean_tags()("meta-lead, doctors"), "meta-lead,doctors")

    def test_drops_empties_and_duplicates_and_keeps_order(self):
        self.assertEqual(_clean_tags()(" a ,, b,a , "), "a,b")

    def test_accepts_a_list_and_none(self):
        self.assertEqual(_clean_tags()([" x ", "y", "x"]), "x,y")
        self.assertEqual(_clean_tags()(None), "")


if __name__ == "__main__":
    unittest.main()
