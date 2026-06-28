import asyncio
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.podcast import Podcast
from app.services.analysis_service import generate_key_takeaways_with_groq
from app.models.analysis import TranscriptionResult

async def main():
    db: Session = SessionLocal()
    podcasts = db.query(Podcast).all()
    updated = 0
    for p in podcasts:
        if p.import_metadata and "key_takeaways" not in p.import_metadata:
            trans_data = p.import_metadata.get("transcription_data")
            if trans_data:
                try:
                    trans = TranscriptionResult.model_validate(trans_data)
                    if trans.transcript_text:
                        print(f"Generating takeaways for podcast {p.id}...")
                        takeaways = generate_key_takeaways_with_groq(trans.transcript_text)
                        if takeaways:
                            p.import_metadata["key_takeaways"] = takeaways
                            from sqlalchemy.orm.attributes import flag_modified
                            flag_modified(p, "import_metadata")
                            db.commit()
                            updated += 1
                            print(f"Success for {p.id}")
                except Exception as e:
                    print(f"Error for {p.id}: {e}")
    print(f"Finished updating {updated} podcasts.")

if __name__ == "__main__":
    asyncio.run(main())
