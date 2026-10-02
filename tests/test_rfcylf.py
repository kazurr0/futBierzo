import json
import unittest
import tempfile
from unittest.mock import patch
from backend.store import Store
from backend.rfcylf import main
from datetime import date
from pathlib import Path
from backend.rfcylf import parse_schedule

ROOT = Path(__file__).resolve().parents[1]


class ScheduleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT/'tests/fixtures/schedule_bembibre.html').read_text(encoding='utf-8')
        cls.catalog = json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
    def parse(self,html=None):
        return parse_schedule(html or self.html,self.catalog,date(2026,10,1),date(2026,10,7))
    def test_real_snapshot_keeps_all_13_matches_including_unassigned_time(self):
        items = self.parse()
        self.assertEqual(len(items),13)
        pending = next(m for m in items if m['id']=='26165247')
        self.assertIsNone(pending['time'])
        self.assertEqual(pending['date'],'2026-10-04')
        self.assertNotIn('away_team_id',pending)
        self.assertIn({'side':'away','name':'Atlético Bembibre "B"'},pending['unresolved_teams'])
        self.assertTrue(all(m['score'] is None for m in items))
    def test_away_match_has_no_wrong_home_identity(self):
        item = next(m for m in self.parse() if m['id']=='26136182')
        self.assertNotIn('home_team_id',item)
        self.assertEqual(len(item['team_ids']),1)
        self.assertEqual(item['away'],'Atlético Bembibre')
    def test_incomplete_response_and_missing_total_are_rejected(self):
        with self.assertRaises(ValueError):
            self.parse(self.html.replace('Total 13 Registros','Total 14 Registros'))
        with self.assertRaises(ValueError):
            self.parse('<html>Acceso no disponible</html>')
    def test_successful_query_survives_a_later_club_failure(self):
        records = self.parse()
        def interrupted(*args, **kwargs):
            kwargs['on_result']('4006',date(2026,10,1),date(2026,10,7),records)
            raise RuntimeError('Next club unavailable')
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder)/'matches.sqlite'
            with patch('sys.argv',['collector','--today','2026-10-01','--db',str(db)]), patch('backend.rfcylf.collect_schedules',side_effect=interrupted):
                with self.assertRaises(SystemExit):
                    main()
            store = Store(db)
            self.assertEqual(len(store.matches('2026-10-01','2026-10-07')),13)
            self.assertEqual(json.loads(store.metadata('schedule_coverage'))[0]['club_id'],'4006')

    def test_explicit_zero_is_valid_and_wrong_date_is_rejected(self):
        self.assertEqual(self.parse('<html>Total 0 Registros</html>'),[])
        with self.assertRaises(ValueError):
            self.parse(self.html.replace('03-10-2026','03-11-2026'))


if __name__ == '__main__':
    unittest.main()
