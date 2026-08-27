"""Comprehensive end-to-end API test suite for NexusTrack."""

import pytest
from fastapi.testclient import TestClient

from app.main import fastapi_app

client = TestClient(fastapi_app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_auth_login():
    # Valid login
    res = client.post("/auth/login-json", json={"email": "maya@nexustrack.dev", "password": "demo1234"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "maya@nexustrack.dev"
    assert data["user"]["role"] == "admin"

    # Invalid login
    res_bad = client.post("/auth/login-json", json={"email": "maya@nexustrack.dev", "password": "wrongpassword"})
    assert res_bad.status_code == 401


def test_auth_register_with_role():
    import uuid
    uid = uuid.uuid4().hex[:6]
    email = f"dev_{uid}@nexustrack.dev"
    res = client.post(
        "/auth/register",
        json={
            "name": "Jordan Dev",
            "email": email,
            "password": "securepassword123",
            "role": "developer",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == email
    assert data["user"]["role"] == "developer"
    assert "access_token" in data


def get_token(email="maya@nexustrack.dev", password="demo1234"):
    res = client.post("/auth/login-json", json={"email": email, "password": password})
    return res.json()["access_token"]


def test_projects_and_components():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/projects", headers=headers)
    assert res.status_code == 200
    projects = res.json()
    assert len(projects) > 0
    project_id = projects[0]["id"]

    res_comp = client.get(f"/projects/{project_id}/components", headers=headers)
    assert res_comp.status_code == 200
    assert len(res_comp.json()) > 0


def test_ai_triage_and_duplicate_detection():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Test triage with title similar to seeded auth duplicate issue
    res = client.post(
        "/ai/triage",
        headers=headers,
        json={
            "project_id": 1,
            "title": "Double-clicking Sign in creates two JWT sessions",
            "description": "Users report two live sessions after impatient clicks.",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "severity" in data
    assert "priority" in data
    assert "duplicates" in data
    assert len(data["duplicates"]) > 0


def test_issue_lifecycle_and_state_machine():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a new issue
    res = client.post(
        "/issues",
        headers=headers,
        json={
            "project_id": 1,
            "title": "Automated Test Issue for Lifecycle Verification",
            "description": "Testing transitions and audit trails.",
            "labels": ["test", "automation"],
            "environment": "test-ci",
            "accept_ai": True,
        },
    )
    assert res.status_code == 200
    issue = res.json()
    issue_id = issue["id"]
    assert issue["status"] == "NEW"

    # 2. Test illegal transition (NEW -> CLOSED should return HTTP 409)
    res_illegal = client.post(
        f"/issues/{issue_id}/status",
        headers=headers,
        json={"status": "CLOSED", "note": "Illegal jump directly to CLOSED"},
    )
    assert res_illegal.status_code == 409

    # 3. Test legal transition (NEW -> TRIAGED -> IN_PROGRESS -> IN_REVIEW)
    res_legal = client.post(
        f"/issues/{issue_id}/status",
        headers=headers,
        json={"status": "TRIAGED", "note": "Triaged by test runner"},
    )
    assert res_legal.status_code == 200
    assert res_legal.json()["status"] == "TRIAGED"

    res_prog = client.post(
        f"/issues/{issue_id}/status",
        headers=headers,
        json={"status": "IN_PROGRESS", "note": "Starting work"},
    )
    assert res_prog.status_code == 200

    # 4. Verify history audit trail
    res_hist = client.get(f"/issues/{issue_id}/history", headers=headers)
    assert res_hist.status_code == 200
    history = res_hist.json()
    assert len(history) >= 3


def test_internal_comments_rbac():
    # Admin / Dev token
    dev_token = get_token("priya@nexustrack.dev")
    reporter_token = get_token("sofia@nexustrack.dev")

    # Post an internal comment as developer
    res_com = client.post(
        "/issues/1/comments",
        headers={"Authorization": f"Bearer {dev_token}"},
        json={"body": "Internal secret developer note", "is_internal": True},
    )
    assert res_com.status_code == 200

    # Developer should see the internal comment
    res_dev_view = client.get("/issues/1/comments", headers={"Authorization": f"Bearer {dev_token}"})
    assert any(c["body"] == "Internal secret developer note" for c in res_dev_view.json())

    # Reporter should NOT see the internal comment
    res_rep_view = client.get("/issues/1/comments", headers={"Authorization": f"Bearer {reporter_token}"})
    assert not any(c["body"] == "Internal secret developer note" for c in res_rep_view.json())


def test_dependency_linking_and_validation():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Self-dependency should be blocked (400)
    res_self = client.post(
        "/issues/1/dependencies",
        headers=headers,
        json={"depends_on_issue_id": 1, "type": "blocks"},
    )
    assert res_self.status_code == 400

    # Non-existing issue should return 404
    res_404 = client.post(
        "/issues/1/dependencies",
        headers=headers,
        json={"depends_on_issue_id": 999999, "type": "blocks"},
    )
    assert res_404.status_code == 404


def test_search_and_query_builder():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Search with Boolean group
    res = client.post(
        "/search",
        headers=headers,
        json={
            "q": "login",
            "group": {
                "op": "AND",
                "rules": [{"field": "status", "op": "neq", "value": "CLOSED"}],
            },
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


def test_dashboard_and_csv_export():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "totals" in data
    assert "by_status" in data
    assert "trend" in data
    assert "cfd" in data

    res_csv = client.get("/dashboard/export.csv", headers=headers)
    assert res_csv.status_code == 200
    assert "id,number,title" in res_csv.text
    assert res_csv.headers.get("content-disposition", "").startswith("attachment")


def test_github_demo_merge():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/integrations/github/demo-merge/8", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "RESOLVED"
    assert data["ci_status"] == "success"
    assert "pull" in data["github_pr"]
