"""Staging-only end-to-end check that lead details reach the agent.

Creates a room in the STAGING LiveKit project whose metadata carries a contact's
custom fields (the same shape a campaign dial stamps), joins it as a caller,
asks what the agent knows, and prints the saved transcript. Refuses non-staging.
"""
import asyncio, json, sys, time, httpx
from pathlib import Path
from livekit import api, rtc
sys.path.insert(0, str(Path(__file__).parent))
from bench_english_latency import Caller, read_wav

WEB, EMAIL, PW, LKURL, LKKEY, LKSECRET, WAV = sys.argv[1:8]
assert "web-stg" in WEB, "staging only"
assert "staging" in LKURL, "staging LiveKit only"

CUSTOM = {
    "business_type": "Clothing store", "website_requirement": "New business website",
    "enquiry_details": "Sells sarees and kurtis from a shop in Camp. Wants customers to see the catalogue and order on WhatsApp.",
    "main_goal": "Get online orders", "budget": "₹10,000–₹20,000", "start_timeline": "Within 30 days",
    "city": "Pune", "preferred_language": "Hinglish", "lead_source": "Facebook ad",
    "platform": "fb", "campaign_name": "Website offer",
}

async def main():
    async with httpx.AsyncClient(base_url=WEB, timeout=60) as c:
        (await c.post("/api/auth/login", json={"email": EMAIL, "password": PW})).raise_for_status()
        agent_id = (await c.get("/api/agents")).json()[0]["id"]
        room = f"notes-test-{int(time.time())}"
        lk = api.LiveKitAPI(LKURL.replace("wss://", "https://"), LKKEY, LKSECRET)
        meta = {"agent_id": agent_id, "custom_fields": CUSTOM, "company": "Verma Traders", "visitor_name": "Asha Verma"}
        await lk.room.create_room(api.CreateRoomRequest(name=room, metadata=json.dumps(meta)))
        token = (api.AccessToken(LKKEY, LKSECRET).with_identity("caller").with_name("Asha")
                 .with_grants(api.VideoGrants(room_join=True, room=room)).to_jwt())
        caller = Caller()
        src = await caller.join(LKURL, token)
        if not await caller.wait_agent_quiet(timeout=40):
            print("NO GREETING"); return
        pcm, rate = read_wav(Path(WAV))
        ms = await caller.ask(src, pcm, rate, reply_timeout=25)
        print(f"agent replied after {ms:.0f} ms" if ms else "NO REPLY")
        await caller.wait_agent_quiet(timeout=40)
        await caller.close(); await lk.room.delete_room(api.DeleteRoomRequest(room=room)); await lk.aclose()
        await asyncio.sleep(8)
        calls = (await c.get("/api/calls")).json()
        mine = [x for x in calls if room in str(x.get("roomName") or x.get("room") or "")] or calls[:1]
        if mine:
            d = (await c.get(f"/api/calls/{mine[0]['id']}")).json()
            for t in d.get("transcript", []):
                print(f"{t.get('role') or t.get('speaker')}: {t.get('text') or t.get('content')}")
asyncio.run(main())
