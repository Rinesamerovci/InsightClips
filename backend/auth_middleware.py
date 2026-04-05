from fastapi import Request, HTTPException
from supabase import create_client, Client
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Initialize Supabase client using environment variables
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

async def get_current_user(request: Request):
    """
    Middleware function to verify the user session using the 
    Supabase JWT token provided in the Authorization header.
    """

    # Extract the Authorization header from the request (Expected format: Bearer <token>)
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        # Raise an error if the header is missing
        raise HTTPException(status_code=401, detail="Authorization header missing!")

    try:
        # Split the header to isolate the JWT token
        token = auth_header.split(" ")[1]
        
        # Verify the token integrity and authenticity via Supabase Auth
        user = supabase.auth.get_user(token)
        
        # If Supabase returns no user data, the token is invalid or expired
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired token!")
            
        return user
        
    except Exception as e:
        # Handle split errors, expired tokens, or communication issues with Supabase
        raise HTTPException(status_code=401, detail="Authentication verification failed!")