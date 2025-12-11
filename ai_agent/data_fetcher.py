import requests
from datetime import datetime
from config import API_FOOTBALL_KEY, API_FOOTBALL_HOST


headers = {
    "x-apisports-key": API_FOOTBALL_KEY,
    "x-rapidapi-host": API_FOOTBALL_HOST
}


def get_today_fixtures():
    today = datetime.now().strftime("%Y-%m-%d")
    url = f"https://{API_FOOTBALL_HOST}/fixtures?next=15"
    r = requests.get(url, headers=headers)
    return r.json().get("response", [])


def get_predictions(fixture_id):
    url = f"https://{API_FOOTBALL_HOST}/predictions?fixture={fixture_id}"
    r = requests.get(url, headers=headers)
    return r.json().get("response", [])


def get_odds(fixture_id):
    url = f"https://{API_FOOTBALL_HOST}/odds?fixture={fixture_id}"
    r = requests.get(url, headers=headers)
    return r.json().get("response", [])
