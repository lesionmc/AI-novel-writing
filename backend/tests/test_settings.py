"""步骤 3：设定库 —— 人物四要素、设定变更追踪、世界词条层级、伏笔台账。"""

from __future__ import annotations


def test_character_four_elements_roundtrip(client, book):
    payload = {
        "name": "张三",
        "role": "protagonist",
        "surface_identity": "旧货摊主",
        "secret_desire": "查明师父死因",
        "fatal_weakness": "不信任任何人",
        "contradiction": "嘴上说不管，每次都出手",
    }
    resp = client.post(f"/api/books/{book}/characters", json=payload)
    assert resp.status_code == 201
    char = resp.json()
    for key, value in payload.items():
        assert char[key] == value

    fetched = client.get(f"/api/characters/{char['id']}").json()
    assert fetched["surface_identity"] == "旧货摊主"
    assert fetched["role"] == "protagonist"


def test_character_list_filters(client, book):
    client.post(f"/api/books/{book}/characters", json={"name": "主角甲", "role": "protagonist"})
    client.post(f"/api/books/{book}/characters", json={"name": "反派乙", "role": "antagonist"})
    only_pro = client.get(f"/api/books/{book}/characters?role=protagonist").json()
    assert [c["name"] for c in only_pro] == ["主角甲"]


def test_affected_chapters_tracks_mentions(client, book):
    char = client.post(f"/api/books/{book}/characters", json={"name": "李四"}).json()
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "初见"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "李四站在门口，没有作声。"})

    resp = client.get(f"/api/characters/{char['id']}/affected-chapters")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["chapter_seq"] == ch["seq"]
    assert rows[0]["matched_in"] == "content"


def test_world_entry_hierarchy_and_parent_null_on_delete(client, book):
    parent = client.post(
        f"/api/books/{book}/world-entries", json={"name": "南疆", "category": "place"}
    ).json()
    child = client.post(
        f"/api/books/{book}/world-entries",
        json={"name": "南疆·黑水城", "category": "place", "parent_id": parent["id"]},
    ).json()
    filtered = client.get(
        f"/api/books/{book}/world-entries?parent_id={parent['id']}"
    ).json()
    assert [e["id"] for e in filtered] == [child["id"]]

    assert client.delete(f"/api/world-entries/{parent['id']}").status_code == 204
    # 删除父级：子级 parent_id 置空，不级联删除（TC-08）
    after = client.get(f"/api/books/{book}/world-entries").json()
    assert len(after) == 1
    assert after[0]["parent_id"] is None


def test_foreshadow_open_filter_and_ordering(client, book):
    high = client.post(
        f"/api/books/{book}/foreshadows",
        json={"title": "神秘玉佩的来历", "planted_chapter_seq": 12, "importance": "high"},
    ).json()
    low = client.post(
        f"/api/books/{book}/foreshadows",
        json={"title": "路人甲的旧伤", "planted_chapter_seq": 3, "importance": "low"},
    ).json()

    opened = client.get(f"/api/books/{book}/foreshadows").json()
    assert [f["importance"] for f in opened] == ["high", "low"]

    client.patch(f"/api/foreshadows/{low['id']}", json={"status": "closed"})
    opened = client.get(f"/api/books/{book}/foreshadows").json()
    assert [f["id"] for f in opened] == [high["id"]]

    all_rows = client.get(f"/api/books/{book}/foreshadows?status=closed").json()
    assert [f["id"] for f in all_rows] == [low["id"]]


def test_character_delete_cascades_state(client, book):
    char = client.post(f"/api/books/{book}/characters", json={"name": "短命配角"}).json()
    assert client.delete(f"/api/characters/{char['id']}").status_code == 204
    resp = client.get(f"/api/characters/{char['id']}")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CHARACTER_NOT_FOUND"
