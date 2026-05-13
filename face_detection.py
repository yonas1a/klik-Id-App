import cv2
import os
import sys

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def detect_and_crop_face(input_path, output_path):
    # Load Haar Cascade for face detection
    face_cascade_path = resource_path("img/asset/haarcascade_frontalface_default.xml")
    face_cascade = cv2.CascadeClassifier(face_cascade_path)

    image = cv2.imread(input_path)

    if image is None:
        print(f"Error: Could not read image {input_path}")
        return False

    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Detect faces
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(100, 100) # Increased min size to avoid false positives in background
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if len(faces) == 0:
        print("No faces detected. Returning original image.")
        return False
        
    print(f"Detected {len(faces)} face(s)!")
    
    # We take the largest face detected to be the primary subject
    largest_face = max(faces, key=lambda rect: rect[2] * rect[3])
    x, y, w, h = largest_face
    
    img_h, img_w = image.shape[:2]
    
    # 3x4 aspect ratio logic centered on face
    # Let's adjust height based on width of face and padding
    
    y = int(y - (h/1.5)) # more space above head
    h = int((h/2) * 4)   # total height
    cx = int((w/2) + x)  # center of face
    mx = int(h * (3/8))  # 3x4 ratio means width is 3/4 of height. margin x is half of that. (h * 0.75 / 2)
    
    y1 = max(0, y)
    y2 = min(img_h, y + h)
    x1 = max(0, cx - mx)
    x2 = min(img_w, cx + mx)

    face = image[y1:y2, x1:x2]

    if face.size == 0 or face.shape[0] < 10 or face.shape[1] < 10:
        print("Skipping: Invalid crop region")
        return False

    # Force 3:4 ratio for the ID (e.g., 820x1094 for high quality)
    target_size = (820, 1094) 
    
    original_h, original_w = face.shape[:2]
    
    # Calculate scale to maintain aspect ratio
    scale = min(target_size[0] / original_w, target_size[1] / original_h)
    new_w = int(original_w * scale)
    new_h = int(original_h * scale)
    
    resized_face = cv2.resize(face, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    # Pad to exact target size with white background (useful when background gets removed anyway)
    canvas = cv2.copyMakeBorder(
        resized_face,
        top=(target_size[1] - new_h) // 2,
        bottom=(target_size[1] - new_h + 1) // 2,
        left=(target_size[0] - new_w) // 2,
        right=(target_size[0] - new_w + 1) // 2,
        borderType=cv2.BORDER_CONSTANT,
        value=(255, 255, 255)
    )
    
    cv2.imwrite(output_path, canvas)
    return True
