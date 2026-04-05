from fastapi import Request, HTTPException
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

async def get_current_user(request: Request):

    # Get the token from the request header (Authorization: Bearer ...)
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Mungon autorizimi!")

    try:
        token = auth_header.split(" ")[1]
        # Verify the token with Supabase
        user = supabase.auth.get_user(token)
        if not user:
            raise HTTPException(status_code=401, detail="Token i pavlefshëm!")
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Gabim gjatë verifikimit!")