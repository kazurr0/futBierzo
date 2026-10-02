import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from backend.store import Store, schedule_windows


def match(**changes):
    raw = {'id':'26155433','home':'Local','away':'Visitante','competition':'Infantiles',
           'team_ids':['1'], 'status':'scheduled', 'date':'2026-10-03','time':None}
    return raw | changes


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'matches.sqlite')
    def tearDown(self):
        self.tmp.cleanup()
    def get(self):
        return self.store.matches('2026-10-01','2026-10-14')
    def test_windows_cross_month_without_gap(self):
        self.assertEqual(schedule_windows(date(2026,10,28)), [(date(2026,10,28),date(2026,11,3)),(date(2026,11,4),date(2026,11,10))])
    def test_schedule_update_fills_time_without_duplicate(self):
        self.store.upsert([match()],{'1'})
        self.store.upsert([match(time='18:00')],{'1'})
        self.assertEqual(len(self.get()),1)
        self.assertEqual(self.get()[0]['time'],'18:00')
    def test_unknown_dates_remain_visible_and_empty_selection_matches_nothing(self):
        self.store.upsert([match(date=None)],{'1'})
        self.assertEqual(len(self.get()),1)
        self.assertEqual(self.store.matches('2026-10-01','2026-10-14',set()),[])
    def test_invalid_batch_rolls_back(self):
        with self.assertRaises(ValueError):
            self.store.upsert([match(),match(id='222',team_ids=['999'])],{'1'})
        self.assertEqual(self.get(),[])
        self.assertIsNone(self.store.last_import())
    def test_duplicate_batch_rolls_back(self):
        with self.assertRaises(ValueError):
            self.store.upsert([match(),match()],{'1'})
        self.assertEqual(self.get(),[])
    def test_old_live_update_does_not_replace_newer_score(self):
        self.store.upsert([match(status='provisional',score=[2,2],updated_at='2026-10-01T18:00:00+02:00')],{'1'})
        self.store.upsert([match(status='live',score=[1,0],updated_at='2026-10-01T17:45:00+02:00')],{'1'})
        self.assertEqual(self.get()[0]['score'],[2,2])
    def test_schedule_does_not_erase_live_or_infer_halftime(self):
        self.store.upsert([match(status='provisional',score=[2,2])],{'1'})
        self.store.upsert([match(time='17:30')],{'1'})
        self.assertEqual(self.get()[0]['status'],'provisional')
        self.assertEqual(self.get()[0]['score'],[2,2])
        self.assertIsNone(self.get()[0].get('halftime_score'))
    def test_score_zero_is_valid_but_negative_and_naive_timestamp_are_rejected(self):
        self.store.upsert([match(score=[0,0])],{'1'})
        with self.assertRaises(ValueError):
            self.store.upsert([match(score=[-1,0])],{'1'})
        with self.assertRaises(ValueError):
            self.store.upsert([match(updated_at='2026-10-01T18:00:00')],{'1'})
    def test_side_identity_must_belong_to_participating_teams(self):
        with self.assertRaises(ValueError):
            self.store.upsert([match(home_team_id='999')],{'1'})
        self.store.upsert([match(away_team_id='1')],{'1'})
        self.assertEqual(self.get()[0]['away_team_id'],'1')


if __name__ == '__main__':
    unittest.main()
