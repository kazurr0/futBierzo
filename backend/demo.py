from datetime import datetime, timedelta, timezone


def demo_matches(catalog, today):
    teams = catalog['teams']
    clubs = {}
    for team in teams:
        clubs.setdefault(team['club_id'], team)
    teams = list(clubs.values())
    # Separate ephemeral sample feed. Never inserted into the real database.
    sample = []
    for index, status in enumerate(('live', 'provisional', 'scheduled', 'scheduled', 'final')):
        home, away = teams[index * 2:index * 2 + 2]
        item = {'id': f'demo-{index}', 'home': home['name'], 'away': away['name'],
                'team_ids': [home['id'], away['id']], 'home_team_id':home['id'],
                'away_team_id':away['id'], 'competition': home['competition'],
                'date': (today + timedelta(days=index if index < 4 else 0)).isoformat(),
                'time': None if index == 3 else '17:30', 'status': status,
                'score': [2, 1] if status in ('live', 'provisional', 'final') else None,
                'halftime_score': [1, 1] if status == 'final' else None,
                'field': home['field'], 'source': 'Ejemplo ficticio', 'lineups': None,
                'events': None, 'updated_at': datetime.now(timezone.utc).isoformat()}
        if index == 3:
            item['date'] = None
        sample.append(item)
    return sample
