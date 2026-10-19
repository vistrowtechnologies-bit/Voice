"""Budgets exactly as callers and forms gave them in production (19 Oct)."""
import unittest

from budget_parse import budget_midpoint_inr, parse_budget_inr

L, CR = 10**5, 10**7


class BudgetParseTests(unittest.TestCase):
    def test_english_amounts_and_ranges(self):
        cases = {
            "55 lakhs": (55 * L, 55 * L),
            "10 lakh": (10 * L, 10 * L),
            "around 60 lakhs": (60 * L, 60 * L),
            "₹1 crore": (CR, CR),
            "2 crore": (2 * CR, 2 * CR),
            "₹90 lakh": (90 * L, 90 * L),
            "₹50 lakhs": (50 * L, 50 * L),
            "20000": (20000, 20000),
            "₹3000": (3000, 3000),
            "INR 80,00,000 - 1,00,00,000": (80 * L, CR),
            "80,00,000 - 1,00,00,000": (80 * L, CR),
            "INR 1,25,00,000 - 1,50,00,000": (125 * L, 150 * L),
            "₹10,000–₹20,000": (10000, 20000),
            "₹10,000 to ₹20,000": (10000, 20000),
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(parse_budget_inr(text), expected)

    def test_spoken_english_words(self):
        self.assertEqual(parse_budget_inr("eighty four lakh to one crore"), (84 * L, CR))
        self.assertEqual(parse_budget_inr("One crore"), (CR, CR))
        self.assertEqual(parse_budget_inr("ninety lakh"), (90 * L, 90 * L))
        self.assertEqual(parse_budget_inr("one crore to one and a half crore"), (CR, 150 * L))

    def test_hindi_words_and_devanagari_digits(self):
        self.assertEqual(parse_budget_inr("एक करोड़"), (CR, CR))
        # The same words with ड़ as ड + nukta, as one production row had them.
        self.assertEqual(parse_budget_inr("एक \u0915\u0930\u094b\u0921\u093c"), (CR, CR))
        self.assertEqual(parse_budget_inr("एक \u0915\u0930\u094b\u095c"), (CR, CR))
        self.assertEqual(parse_budget_inr("दो करोड़"), (2 * CR, 2 * CR))
        self.assertEqual(parse_budget_inr("करीब पचासी लाख"), (85 * L, 85 * L))
        self.assertEqual(parse_budget_inr("८० लाख"), (80 * L, 80 * L))
        self.assertEqual(parse_budget_inr("20 लाख"), (20 * L, 20 * L))
        self.assertEqual(parse_budget_inr("2.4-2.8 करोड़"), (24 * 10**6, 28 * 10**6))
        self.assertEqual(parse_budget_inr("दस हजार से बीस हजार रुपए"), (10000, 20000))
        self.assertEqual(parse_budget_inr("₹१०,००० से ₹२०,०००"), (10000, 20000))

    def test_not_a_budget(self):
        for text in ("basic website info WhatsApp pe bhejni hai", "Not provided", "not applicable", "null", "basic", "not mentioned", "", None):
            with self.subTest(text=text):
                self.assertIsNone(parse_budget_inr(text))

    def test_midpoint(self):
        self.assertEqual(budget_midpoint_inr("80 lakh to 1 crore"), 90 * L)
        self.assertIsNone(budget_midpoint_inr("basic"))


if __name__ == "__main__":
    unittest.main()
