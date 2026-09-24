"""The help centre and the help bot share one set of articles."""
import unittest
from unittest.mock import patch

import help_articles
import help_chat


class Content(unittest.TestCase):
    def test_slugs_are_unique(self):
        slugs = [a["slug"] for a in help_articles.all_articles()]
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_every_topic_points_at_a_real_dashboard_page(self):
        from pathlib import Path
        app = (Path(__file__).resolve().parent.parent / "web-demo" / "src" / "App.tsx").read_text()
        for topic in help_articles.TOPICS:
            self.assertIn(f'path="{topic["route"]}"', app, topic["slug"])

    def test_no_stale_facts(self):
        text = " ".join(a["body"] for a in help_articles.all_articles())
        for stale in ("Google Calendar", "600 KB", "buy a number"):
            self.assertNotIn(stale, text)

    def test_search_finds_the_right_article(self):
        self.assertEqual(help_articles.search("send leads to zoho crm")[0]["slug"], "connect-integrations")
        self.assertEqual(help_articles.search("screenshot request support")[0]["slug"], "contact-support")
        self.assertEqual(help_articles.search("do not call list")[0]["topicSlug"], "compliance")
        self.assertEqual(help_articles.search("?"), [])


class BotLinks(unittest.TestCase):
    def test_only_real_articles_are_linked(self):
        real = help_chat._structured_reply({"content": '{"reply":"x","articleSlug":"connect-integrations"}'})
        self.assertEqual(real["article"]["title"], "Send leads to your CRM and tools")
        made_up = help_chat._structured_reply({"content": '{"reply":"x","articleSlug":"imaginary-page"}'})
        self.assertIsNone(made_up["article"])
        self.assertIsNone(help_chat._structured_reply({"content": "not json"}).get("article"))


if __name__ == "__main__":
    unittest.main()
