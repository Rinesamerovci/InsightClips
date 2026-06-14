import os
import subprocess
import urllib.request
import tarfile
from pathlib import Path

def main():
    print("Installing Python requirements...")
    subprocess.run(["pip", "install", "-r", "requirements.txt"], check=True)

    print("Checking/Downloading static ffmpeg/ffprobe binaries...")
    bin_dir = Path("bin")
    bin_dir.mkdir(exist_ok=True)

    ffmpeg_bin = bin_dir / "ffmpeg"
    ffprobe_bin = bin_dir / "ffprobe"

    if ffmpeg_bin.exists() and ffprobe_bin.exists():
        print("ffmpeg and ffprobe already exist in bin/")
        return

    url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    tar_path = Path("ffmpeg.tar.xz")

    try:
        print(f"Downloading static ffmpeg from {url}...")
        urllib.request.urlretrieve(url, tar_path)
        print("Extracting binaries...")
        with tarfile.open(tar_path, "r:xz") as tar:
            for member in tar.getmembers():
                if member.name.endswith(("/ffmpeg", "/ffprobe")):
                    # Extract directly to the bin directory with flat names
                    member.name = os.path.basename(member.name)
                    tar.extract(member, path=bin_dir)

        # Set executable permissions
        for tool in ["ffmpeg", "ffprobe"]:
            tool_path = bin_dir / tool
            if tool_path.exists():
                os.chmod(tool_path, 0o755)
        print("ffmpeg and ffprobe installed successfully in bin/")
    except Exception as e:
        print(f"Warning: Failed to download/install ffmpeg: {e}")
        print("The app will continue, but video processing features may fail.")
    finally:
        if tar_path.exists():
            tar_path.unlink()

if __name__ == "__main__":
    main()
