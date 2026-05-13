from PIL import Image, ImageDraw, ImageFont
import os
import sys
import shutil

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

from face_detection import detect_and_crop_face
from remove_bg import remove_background, BG_OK, BG_ERR_QUOTA, BG_ERR_NETWORK, BG_ERR_INVALID, BG_ERR_UNKNOWN

def text_width(draw, text, text_size, text_font_path):
    try:
        font = ImageFont.truetype(text_font_path, text_size)
    except:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]

def check_bbox(draw, text, text_size, text_font_path, canvas_width=1559):
    w = text_width(draw, text, text_size, text_font_path)
    return (canvas_width - w) / 2

def process_employee_photo(photo_path, force_bg_remove=False):
    if not photo_path or not os.path.exists(photo_path):
        return (photo_path, "no_file")
        
    temp_cropped = "img/temp_face.jpg"
    temp_nobg = "img/temp_face_nobg.png"
    
    # Manual BG removal: apply on top of already-cropped image
    if force_bg_remove:
        if os.path.exists(temp_nobg):
            try: os.remove(temp_nobg)
            except: pass
        if os.path.exists(temp_cropped):
            result = remove_background(temp_cropped, temp_nobg)
            if result == BG_OK:
                return (temp_nobg, BG_OK)
            else:
                return (temp_cropped, result)  # return path + error code
        return (photo_path, BG_ERR_INVALID)
    
    # Initial path (just detect and crop)
    if os.path.exists(temp_cropped):
        try: os.remove(temp_cropped)
        except: pass
    if os.path.exists(temp_nobg):
        try: os.remove(temp_nobg)
        except: pass
        
    if detect_and_crop_face(photo_path, temp_cropped):
        return (temp_cropped, "ok")
    return (photo_path, "no_face")

def generate_id_preview(name_am, name_en, emp_id, phone, branch, processed_photo_path, orientation="vertical", position="Employee"):
    # =========================================================================
    # PHOTO PLACEMENT SETTINGS - Modifier les valeurs ci-dessous pour ajuster
    # =========================================================================
    
    # VERTICAL ID Settings
    VERT_PHOTO_SIZE = (820, 1094)   # Width, Height
    VERT_PHOTO_POS = (370, 445)      # X, Y coordinates
    
    # HORIZONTAL ID Settings
    HORIZ_PHOTO_SIZE = (732, 976)   # Width, Height
    HORIZ_PHOTO_POS = (100, 450)      # X, Y coordinates
    
    # =========================================================================
    
    amharic_font = resource_path("font/SHIROMEDA-BOLD.TTF")
    english_font = resource_path("font/Urbanist-Medium.ttf")
    
    # Check if fonts exist, otherwise fallback
    if not os.path.exists(amharic_font): amharic_font = "arial.ttf" # Fallback for dev if needed
    if not os.path.exists(english_font): english_font = "arial.ttf"

    if orientation == "vertical":
        back = Image.open(resource_path("img/asset/back.png")).convert("RGBA")
        front = Image.open(resource_path("img/asset/front.png")).convert("RGBA")
        
        if processed_photo_path and os.path.exists(processed_photo_path):
            photo = Image.open(processed_photo_path).convert("RGBA")
            photo = photo.resize(VERT_PHOTO_SIZE)
            back.paste(photo, VERT_PHOTO_POS, photo)
        
        back.paste(front, (0, 0), front)
        draw = ImageDraw.Draw(back)
        
        tw = text_width(draw, name_am, 120, amharic_font)
        if tw > 1300:
            parts = name_am.split(" ")
            if len(parts) >= 3:
                line1 = parts[0] + " " + parts[1]
                line2 = " ".join(parts[2:])
                draw.text((check_bbox(draw, line1, 120, amharic_font), 1450), line1, font=ImageFont.truetype(amharic_font, 120), fill=(255, 255, 255, 255))
                draw.text((check_bbox(draw, line2, 120, amharic_font), 1555), line2, font=ImageFont.truetype(amharic_font, 120), fill=(255, 255, 255, 255))
                draw.text((check_bbox(draw, name_en, 70, english_font), 1685), name_en, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
            else:
                draw.text((check_bbox(draw, name_am, 120, amharic_font), 1450), name_am, font=ImageFont.truetype(amharic_font, 120), fill=(255, 255, 255, 255))
                draw.text((check_bbox(draw, name_en, 70, english_font), 1595), name_en, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        else:
            draw.text((check_bbox(draw, name_am, 120, amharic_font), 1450), name_am, font=ImageFont.truetype(amharic_font, 120), fill=(255, 255, 255, 255))
            draw.text((check_bbox(draw, name_en, 70, english_font), 1595), name_en, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))

        draw.text((505, 1860), position if position else "Employee", font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        draw.text((505, 1940), emp_id, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        draw.text((505, 2020), branch, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        draw.text((505, 2100), phone, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        
        return back.convert("RGB")
    
    else: # horizontal
        back = Image.open(resource_path("img/asset/H_back.png")).convert("RGBA")
        front = Image.open(resource_path("img/asset/H_front.png")).convert("RGBA")
        
        if processed_photo_path and os.path.exists(processed_photo_path):
            photo = Image.open(processed_photo_path).convert("RGBA")
            photo = photo.resize(HORIZ_PHOTO_SIZE)
            back.paste(photo, HORIZ_PHOTO_POS, photo)
            
        back.paste(front, (0, 0), front)
        draw = ImageDraw.Draw(back)
        
        draw.text((920, 550), name_am, font=ImageFont.truetype(amharic_font, 120), fill=(255, 255, 255, 255))
        draw.text((920, 700), name_en, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        draw.text((920, 895), position if position else "Employee", font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255)) 
        draw.text((920, 1090), branch, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        draw.text((1320, 1290), phone, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        draw.text((920, 1290), emp_id, font=ImageFont.truetype(english_font, 70), fill=(255, 255, 255, 255))
        
        return back.convert("RGB")

def generate_back_id(orientation="vertical"):
    from datetime import date
    english_font = resource_path("font/Urbanist-Medium.ttf")
    if not os.path.exists(english_font): english_font = "arial.ttf"
    
    if orientation == "vertical":
        back_id = Image.open(resource_path("img/asset/back_id.png")).convert("RGBA")
        draw = ImageDraw.Draw(back_id)
        year = int(date.today().strftime("%Y"))
        issue_date = date.today().strftime("%d-%m-")+str(year)
        expire_date = date.today().strftime("%d-%m-")+str(year+10)
        draw.text((550, 1113), issue_date, font=ImageFont.truetype(english_font, 60), fill=(0, 0, 0, 255))
        draw.text((550, 1260), expire_date, font=ImageFont.truetype(english_font, 60), fill=(0, 0, 0, 255))
        return back_id.convert("RGB")
    else:
        back_id = Image.open(resource_path("img/asset/H_back_id.png")).convert("RGBA")
        draw = ImageDraw.Draw(back_id)
        year = int(date.today().strftime("%Y"))
        issue_date = date.today().strftime("%d-%m-")+str(year)
        expire_date = date.today().strftime("%d-%m-")+str(year+10)
        draw.text((450, 1160), issue_date, font=ImageFont.truetype(english_font, 60), fill=(0, 0, 0, 255))
        draw.text((450, 1310), expire_date, font=ImageFont.truetype(english_font, 60), fill=(0, 0, 0, 255))
        return back_id.convert("RGB")
