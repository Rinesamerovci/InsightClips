import subprocess
import json
import sys
import os

def get_video_duration(video_path: str):
    if not os.path.exists(video_path):
        print(f"File not found: {video_path}")
        return

    # Use ffprobe to get duration in seconds
    command = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    
    try:
        print(f"Checking duration for {video_path}...")
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        duration = float(result.stdout.strip())
        print(f"Success! Video duration is: {duration:.2f} seconds.")
    except FileNotFoundError:
        print("Error: ffprobe is not installed or not found in system PATH.")
    except subprocess.CalledProcessError as e:
        print(f"Error reading video duration: {e.stderr.strip()}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_ffmpeg.py <path_to_video.mp4>")
        print("Since no arguments were provided, the script assumes setup is correct. Provide an mp4 file to actually test.")
    else:
        get_video_duration(sys.argv[1])
