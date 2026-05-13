import requests
from PIL import Image
from io import BytesIO
import os

# Error codes returned by remove_background
BG_OK = "ok"
BG_ERR_QUOTA = "quota_exceeded"
BG_ERR_NETWORK = "network_error"
BG_ERR_INVALID = "invalid_image"
BG_ERR_UNKNOWN = "unknown_error"

def remove_background(input_path, output_path):
    API_KEY = "eUwJQpab7r9jFH4Gpx5X38ib"

    if os.path.exists(output_path):
        return BG_OK

    if not os.path.exists(input_path):
        return BG_ERR_INVALID
    
    try:
        response = requests.post(
            "https://api.remove.bg/v1.0/removebg",
            files={"image_file": open(input_path, "rb")},
            data={"size": "auto"},
            headers={"X-Api-Key": API_KEY},
            timeout=30
        )
        
        if response.status_code == 200:
            img = Image.open(BytesIO(response.content))
            img.save(output_path)
            return BG_OK
        elif response.status_code == 402:
            # Payment required = quota/credits exhausted
            print(f"Remove BG quota exceeded: {response.status_code}")
            return BG_ERR_QUOTA
        elif response.status_code == 400:
            print(f"Remove BG invalid image: {response.text}")
            return BG_ERR_INVALID
        else:
            print(f"Remove BG failed: {response.status_code} - {response.text}")
            return BG_ERR_UNKNOWN
            
    except requests.exceptions.ConnectionError:
        return BG_ERR_NETWORK
    except requests.exceptions.Timeout:
        return BG_ERR_NETWORK
    except Exception as e:
        print(f"Error removing bg: {e}")
        return BG_ERR_UNKNOWN