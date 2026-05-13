import webbrowser
import os
import sys

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Ensure current directory is in sys.path for robust imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

import customtkinter as ctk
from PIL import Image, ImageTk
try:
    from id_generator import generate_id_preview, generate_back_id, process_employee_photo
except ImportError:
    # Fallback for some IDE environments
    sys.path.append(".")
    from id_generator import generate_id_preview, generate_back_id, process_employee_photo

import json
import tkinter.filedialog as fd
from tkinter import messagebox
import threading
import ctypes

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class IDMakerApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.withdraw() # Hide main app window immediately
        self.after(10, self.withdraw) 
        self.after(50, self.withdraw)

        # Window state
        self._is_maximized = False
        self._old_geometry = "1400x700"

        self.title("MOHA ID Maker Professional")
        self.geometry("1400x700")
        self.center_window(1400, 700)
        self.minsize(1200, 500)
        # self.overrideredirect(True) moved to setup_main_ui
        
        # State tracking
        self.is_saved = True
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Custom window properties will be set in setup_main_ui

        # Fix for taskbar icon on Windows (Group ID)
        try:
            myappid = 'moha.softdrinks.idmaker.v2' # unique string
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
        except:
            pass

        icon_path = resource_path("app_icon.ico")
        if os.path.exists(icon_path):
            def _set_icon():
                try: self.wm_iconbitmap(icon_path)
                except: pass
            self.after(0, _set_icon)
            self.after(200, _set_icon)
            self.after(600, _set_icon)
            self.after(1500, _set_icon)
        
        # App Variables
        self.photo_path = ""
        self.processed_photo_path = ""
        self.orientation = "vertical"
        
        self.config_file = resource_path("config.json")
        self.default_save_dir = ""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r") as f:
                    config = json.load(f)
                    self.default_save_dir = config.get("save_dir", "")
            except:
                pass

        # Show Launch Screen immediately, UI will setup when splash ends
        self.after(10, self.show_launch_screen)

    def setup_main_ui(self):
        """Builds all main application widgets and layouts."""
        # Main Grid Layout (responsive)
        self.grid_columnconfigure(0, weight=0, minsize=400) # Fixed width for input
        self.grid_columnconfigure(1, weight=1) # The rest for preview
        self.grid_rowconfigure(0, weight=0) # Title bar
        self.grid_rowconfigure(1, weight=1) # Main content

        # -----------------------------
        # Custom Title Bar
        # -----------------------------
        self.title_bar = ctk.CTkFrame(self, height=40, corner_radius=0, fg_color="#111111")
        self.title_bar.grid(row=0, column=0, columnspan=2, sticky="ew")
        self.title_bar.grid_propagate(False)

        # Title Label
        title_label = ctk.CTkLabel(self.title_bar, text="  MOHA ID Maker Professional", font=ctk.CTkFont(size=14, weight="bold"), text_color="#ffffff")
        title_label.pack(side="left", padx=10)

        # Window Controls Container
        controls_frame = ctk.CTkFrame(self.title_bar, fg_color="transparent")
        controls_frame.pack(side="right", padx=0)

        # Mock standard buttons
        btn_close = ctk.CTkButton(controls_frame, text="✕", width=45, height=40, corner_radius=0, fg_color="transparent", hover_color="#e81123", text_color="white", command=self.on_closing)
        btn_close.pack(side="right")

        self.btn_max = ctk.CTkButton(controls_frame, text="▢", width=45, height=40, corner_radius=0, fg_color="transparent", hover_color="#333333", text_color="white", command=self.toggle_maximize)
        self.btn_max.pack(side="right")

        btn_min = ctk.CTkButton(controls_frame, text="—", width=45, height=40, corner_radius=0, fg_color="transparent", hover_color="#333333", text_color="white", command=self.minimize_window)
        btn_min.pack(side="right")

        # Dragging support
        self.title_bar.bind("<ButtonPress-1>", self.start_move)
        self.title_bar.bind("<B1-Motion>", self.on_motion)
        title_label.bind("<ButtonPress-1>", self.start_move)
        title_label.bind("<B1-Motion>", self.on_motion)

        # -----------------------------
        # Left Panel: Controls & Inputs
        # -----------------------------
        self.input_frame = ctk.CTkFrame(self, corner_radius=0, width=500, fg_color="#1e1e1e", border_width=0)
        self.input_frame.grid(row=1, column=0, sticky="nsew", padx=0, pady=0)
        self.input_frame.grid_propagate(False) 
        
        # Title (of input section)
        input_title_label = ctk.CTkLabel(self.input_frame, text="MOHA ID Information", font=ctk.CTkFont(family="Arial", size=24, weight="bold"))
        input_title_label.pack(pady=(10, 10))

        # Inputs Container
        self.fields_container = ctk.CTkFrame(self.input_frame, fg_color="transparent")
        self.fields_container.pack(fill="both", expand=True, padx=20)

        self.name_am_entry = self.create_input("Name (Amharic):")
        self.name_en_entry = self.create_input("Name (English):")
        self.id_entry = self.create_input("ID Number:")
        self.position_entry = self.create_input("Position:")
        self.phone_entry = self.create_input("Phone:")
        
        # Branch Selection OptionMenu
        branch_frame = ctk.CTkFrame(self.fields_container, fg_color="transparent")
        branch_frame.pack(fill="x", pady=10)
        ctk.CTkLabel(branch_frame, text="Branch:", width=120, anchor="w", font=ctk.CTkFont(size=14, weight="bold")).pack(side="left", padx=(0, 10))
        
        self.branches_list = [
            "Head Office", "Summit Plant", "T/Haymanot Plant", "Nifas Silk Plant", 
            "Mekelle Plant", "Hwassa Millennium Plant", "Desie Plant", 
            "Gonder Plant", "Bure Plant"
        ]
        self.branch_var = ctk.StringVar(value=self.branches_list[0])
        self.branch_dropdown = ctk.CTkOptionMenu(
            branch_frame, 
            values=self.branches_list, 
            variable=self.branch_var, 
            command=self.on_input_change,
            dynamic_resizing=False, 
            height=35,
            corner_radius=0,
            fg_color="#333333",
            button_color="#444444",
            button_hover_color="#555555"
        )
        self.branch_dropdown.pack(side="right", fill="x", expand=True)
        
        # Photo Selection
        self.photo_btn = ctk.CTkButton(
            self.fields_container, text="Select Employee Photo", 
            command=self.select_photo, fg_color="#444444", hover_color="#555555",
            height=40, font=ctk.CTkFont(size=14, weight="bold"),
            corner_radius=0
        )
        self.photo_btn.pack(fill="x", pady=(20, 5))
        
        # Remove BG Button (disabled until photo selected)
        self.remove_bg_btn = ctk.CTkButton(
            self.fields_container, text="Remove Background", 
            command=self.remove_bg_action, fg_color="#444444", hover_color="#555555",
            state="disabled", text_color_disabled="#666666",
            height=30, font=ctk.CTkFont(size=12, weight="bold"),
            corner_radius=0
        )
        self.remove_bg_btn.pack(fill="x", pady=(0, 10))
        
        # Orientation Selection
        self.orientation_var = ctk.StringVar(value="vertical")
        self.orientation_frame = ctk.CTkFrame(self.fields_container, fg_color="transparent")
        self.orientation_frame.pack(fill="x", pady=10)
        
        ctk.CTkLabel(self.orientation_frame, text="Orientation:", width=120, anchor="w", font=ctk.CTkFont(size=14, weight="bold")).pack(side="left", padx=(0, 10))
        ctk.CTkRadioButton(self.orientation_frame, text="Vertical", variable=self.orientation_var, value="vertical", command=self.update_preview_radio, hover_color="#555555").pack(side="left", padx=10)
        ctk.CTkRadioButton(self.orientation_frame, text="Horizontal", variable=self.orientation_var, value="horizontal", command=self.update_preview_radio, hover_color="#555555").pack(side="left", padx=10)

        # Save Settings Frame
        self.save_settings_frame = ctk.CTkFrame(self.input_frame, fg_color="transparent")
        self.save_settings_frame.pack(fill="x", padx=20, pady=(10, 0))

        # Save Dir Display & Change Button
        self.dir_frame = ctk.CTkFrame(self.save_settings_frame, fg_color="transparent")
        self.dir_frame.pack(fill="x", pady=5)
        display_dir = self.truncate_path(self.default_save_dir) if self.default_save_dir else "Not Set"
        self.dir_label = ctk.StringVar(value=f"Save Path: {display_dir}")
        ctk.CTkLabel(self.dir_frame, textvariable=self.dir_label, anchor="w",width=50, font=ctk.CTkFont(size=12, weight="bold")).pack(side="left", fill="x", expand=True, padx=(0, 10))
        ctk.CTkButton(self.dir_frame, text="Change", command=self.change_save_dir, width=60, height=24, corner_radius=0, fg_color="#444444", hover_color="#555555").pack(side="right")
        
        # File Name Input
        self.filename_frame = ctk.CTkFrame(self.save_settings_frame, fg_color="transparent")
        self.filename_frame.pack(fill="x", pady=5)
        ctk.CTkLabel(self.filename_frame, text="File Name:", width=80, anchor="w", font=ctk.CTkFont(size=12, weight="bold")).pack(side="left")
        self.filename_entry = ctk.CTkEntry(self.filename_frame, height=28, corner_radius=0)
        self.filename_entry.pack(side="left", fill="x", expand=True)
        self.filename_entry.bind("<KeyRelease>", lambda e: self.enable_save())

        # Action Buttons Frame
        self.action_frame = ctk.CTkFrame(self.input_frame, fg_color="transparent")
        self.action_frame.pack(fill="x", padx=20, pady=20, side="bottom")

        # Clear Button
        self.clear_btn = ctk.CTkButton(
            self.action_frame, text="Clear All", 
            command=self.clear_all, fg_color="#c0392b", hover_color="#e74c3c",
            height=50, width=120, font=ctk.CTkFont(size=16, weight="bold"),
            corner_radius=0
        )
        self.clear_btn.pack(side="left", padx=(0, 10))

        # Save Button
        self.save_btn = ctk.CTkButton(
            self.action_frame, text="Save ID Images", 
            command=self.save_ids, fg_color="#444444", hover_color="#27ae60",
            state="disabled", text_color_disabled="#ffffff",
            height=50, font=ctk.CTkFont(size=16, weight="bold"),
            corner_radius=0
        )
        self.save_btn.pack(side="right", fill="x", expand=True)

        # -----------------------------
        # Right Panel: Live Preview
        # -----------------------------
        self.preview_frame = ctk.CTkFrame(self, fg_color="#121212", corner_radius=0)
        self.preview_frame.grid(row=1, column=1, sticky="nsew", padx=0, pady=0)
        
        self.preview_frame.grid_columnconfigure(0, weight=1)
        self.preview_frame.grid_rowconfigure(0, weight=1)
        
        # Scrollable container for previews
        self.preview_container = ctk.CTkScrollableFrame(self.preview_frame, fg_color="transparent", corner_radius=0)
        self.preview_container.grid(row=0, column=0, sticky="nsew", padx=20, pady=20)
        self.preview_container.grid_columnconfigure(0, weight=1)
        self.preview_container.grid_columnconfigure(1, weight=1)
        
        self.preview_label_front = ctk.CTkLabel(self.preview_container, text="Front Side Preview", font=ctk.CTkFont(size=18, weight="bold"))
        self.preview_label_front.grid(row=0, column=0, pady=(10, 5))
        
        self.canvas_front = ctk.CTkLabel(self.preview_container, text="")
        self.canvas_front.grid(row=1, column=0, pady=10, padx=10)
        
        self.preview_label_back = ctk.CTkLabel(self.preview_container, text="Back Side Preview", font=ctk.CTkFont(size=18, weight="bold"))
        self.preview_label_back.grid(row=0, column=1, pady=(10, 5))
        
        self.canvas_back = ctk.CTkLabel(self.preview_container, text="")
        self.canvas_back.grid(row=1, column=1, pady=10, padx=10)

        # Custom window properties
        self.overrideredirect(True)
        self.setup_taskbar_icon()

    def start_move(self, event):
        self.x = event.x
        self.y = event.y

    def on_motion(self, event):
        deltax = event.x - self.x
        deltay = event.y - self.y
        x = self.winfo_x() + deltax
        y = self.winfo_y() + deltay
        self.geometry(f"+{x}+{y}")

    def minimize_window(self):
        """Workaround for minimizing overrideredirect windows on Windows."""
        if sys.platform == "win32":
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            ctypes.windll.user32.ShowWindow(hwnd, 6) # 6 = SW_MINIMIZE
        else:
            self.state('iconic')

    def toggle_maximize(self):
        if self._is_maximized:
            self.geometry("1400x700")
            self.center_window(1400, 700)
            self._is_maximized = False
        else:
            width = self.winfo_screenwidth()
            height = self.winfo_screenheight()
            self.geometry(f"{width}x{height}+0+0")
            self._is_maximized = True
            self.btn_max.configure(text="❐")

    def setup_taskbar_icon(self):
        """Force the window to show in the taskbar despite overrideredirect(True)."""
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes

            # Windows Constants
            GWL_EXSTYLE = -20
            WS_EX_APPWINDOW = 0x00040000
            WS_EX_TOOLWINDOW = 0x00000080

            # Get the window handle
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            
            # Set extended styles
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            style = (style & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
            
            # Force update
            ctypes.windll.user32.ShowWindow(hwnd, 5) # SW_SHOW
    
    def center_window(self, width, height, window=None):
        if window is None: window = self
        window.update_idletasks()
        screen_width = window.winfo_screenwidth()
        screen_height = window.winfo_screenheight()
        x = (screen_width // 2) - (width // 2)
        y = (screen_height // 2) - (height // 2)
        window.geometry(f"{width}x{height}+{x}+{y}")

    def show_launch_screen(self):
        """Create a splash screen before user can interact with the app."""
        self.splash = ctk.CTkToplevel(self)
        self.splash.title("Welcome to MOHA ID Maker")
        self.center_window(904, 600, self.splash)
        self.splash.attributes('-topmost', True)
        self.splash.overrideredirect(True) # Remove title bar and borders (Photoshop style)
        self.splash.resizable(False, False)

        # Configure Grid
        self.splash.grid_columnconfigure(0, weight=4) # Left sidebar
        self.splash.grid_columnconfigure(1, weight=6) # Right image
        self.splash.grid_rowconfigure(0, weight=1)

        # Left Sidebar Panel
        left_panel = ctk.CTkFrame(self.splash, fg_color="#111111", corner_radius=0)
        left_panel.grid(row=0, column=0, sticky="nsew")
        
        # Logo
        logo_path = resource_path("img/asset/welcome_logo.png")
        if os.path.exists(logo_path):
            logo_img = Image.open(logo_path)
            logo_ctk = ctk.CTkImage(logo_img, size=(120, 80)) # Scaled logo
            ctk.CTkLabel(left_panel, text="", image=logo_ctk).pack(pady=(40, 0), padx=30, anchor="w")
        
        ctk.CTkLabel(left_panel, text="MEIM V0.1", font=ctk.CTkFont(size=28, weight="bold"), text_color="white").pack(pady=(10, 30), padx=30, anchor="w")
        
        # Terms Section
        ctk.CTkLabel(left_panel, text="TERMS AND CONDITIONS", font=ctk.CTkFont(size=14, weight="bold"), text_color="white").pack(padx=30, anchor="w")
        
        terms = [
            "• This software is for authorized MOHA use only.",
            "• Ensure all data entered is accurate and verified.",
            "• ID card designs are proprietary assets of MOHA Soft Drinks.",
            "• Unauthorized reproduction of ID cards is prohibited."
        ]
        
        for term in terms:
            ctk.CTkLabel(left_panel, text=term, font=ctk.CTkFont(size=11), text_color="#aaaaaa", justify="left", wraplength=320).pack(padx=30, pady=0, anchor="w")
        
        # Progress Section
        progress_frame = ctk.CTkFrame(left_panel, fg_color="transparent")
        progress_frame.pack(pady=(30, 0), padx=30, fill="x")
        
        self.status_label = ctk.CTkLabel(progress_frame, text="Initializing components...", font=ctk.CTkFont(size=11), text_color="#aaaaaa")
        self.status_label.pack(anchor="w")
        
        self.progress_bar = ctk.CTkProgressBar(progress_frame, height=4, progress_color="#ffffff", fg_color="#333333", corner_radius=0)
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x", pady=(5, 0))

        # Developed By Footer
        footer_frame = ctk.CTkFrame(left_panel, fg_color="transparent")
        footer_frame.pack(side="bottom", fill="x", padx=30, pady=20)
        
        ctk.CTkLabel(footer_frame, text="Developed By", font=ctk.CTkFont(size=12, weight="bold"), text_color="#888888").pack(anchor="w")
        
        dev_link = ctk.CTkLabel(footer_frame, text="YONAS AYELE ↗", font=ctk.CTkFont(size=16, weight="bold"), text_color="#1E90FF", cursor="hand2")
        dev_link.pack(anchor="w")
        dev_link.bind("<Button-1>", lambda e: webbrowser.open("https://yonas-ayele.vercel.app"))
        
        ctk.CTkLabel(footer_frame, text="Moha's Employee ID maker 2026", font=ctk.CTkFont(size=10), text_color="#555555").pack(anchor="w", pady=(5, 0))

        # Right Graphic Panel
        right_panel = ctk.CTkFrame(self.splash, fg_color="#111111", corner_radius=0)
        right_panel.grid(row=0, column=1, sticky="nsew")
        right_panel.grid_propagate(False)

        img_path = resource_path("img/asset/welcome_img.png")
        if os.path.exists(img_path):
            bg_img = Image.open(img_path)
            # Match the panel height (600) and scale width proportionally
            bg_ctk = ctk.CTkImage(bg_img, size=(550, 600))
            ctk.CTkLabel(right_panel, text="", image=bg_ctk).pack(expand=True, fill="both")

        def accept():
            if hasattr(self, 'splash') and self.splash.winfo_exists():
                self.splash.destroy()
            
            # Setup the main UI only when the splash is closed
            self.setup_main_ui()
            self.update_preview()
            
            self.after(100, self.deiconify) 
            self.after(150, self.lift)
            self.after(200, self.focus_force)
            
        # Optional: A small "Skip" button instead of a large "Accept"
        self.skip_btn = ctk.CTkButton(
            left_panel, text="Skip", 
            command=accept, height=20, width=60, 
            fg_color="transparent", border_width=1, border_color="#333333",
            text_color="#666666", hover_color="#333333",
            font=ctk.CTkFont(size=10),
            corner_radius=0
        )
        self.skip_btn.place(relx=0.95, rely=0.05, anchor="ne")
        
        # Automatic transition after 4 seconds
        self.countdown_ms = 4000
        self.total_countdown_ms = 4000
        
        status_messages = [
            (3500, "Loading UI modules..."),
            (2500, "Initializing database..."),
            (1500, "Checking assets..."),
            (500, "Finishing startup..."),
            (0, "Ready!")
        ]

        def update_progress():
            if not self.splash.winfo_exists(): return
            
            elapsed = self.total_countdown_ms - self.countdown_ms
            progress = elapsed / self.total_countdown_ms
            self.progress_bar.set(progress)
            
            # Update status messages
            for ms, msg in status_messages:
                if self.countdown_ms <= ms:
                    self.status_label.configure(text=msg)
                    break

            if self.countdown_ms > 0:
                self.countdown_ms -= 50
                self.splash.after(50, update_progress)
            else:
                accept()
        
        self.splash.after(50, update_progress)

    def show_save_notification(self):
        """Shows a transient 'Saved!' message."""
        note = ctk.CTkToplevel(self)
        note.overrideredirect(True)
        note.attributes("-topmost", True)
        note.configure(fg_color="#2ecc71")
        
        lbl = ctk.CTkLabel(note, text="✔ ID Saved Successfully!", font=ctk.CTkFont(size=14, weight="bold"), text_color="white")
        lbl.pack(padx=20, pady=10)
        
        # Center relative to main window
        self.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() // 2) - 100
        y = self.winfo_y() + 50 # Show near the top
        note.geometry(f"+{x}+{y}")
        
        # Auto-close after 2 seconds
        self.after(2000, note.destroy)

        
        # With overrideredirect(True), the window can't be closed via typical means.
        # It will automatically close after 4s or via Skip.

    def on_closing(self):
        if not self.is_saved:
            if messagebox.askyesno("Unsaved Changes", "You have unsaved changes. Do you want to save before exiting?"):
                self.save_ids()
                # If save_ids failed or user needs to fill fields, it might still not be saved
                if not self.is_saved: return
        self.destroy()

    def _get_unique_path(self, directory, filename):
        """Returns a unique path by appending -1, -2, etc. if file exists."""
        base, ext = os.path.splitext(filename)
        counter = 0
        target_path = os.path.join(directory, filename)
        
        while os.path.exists(target_path):
            counter += 1
            new_filename = f"{base}-{counter}{ext}"
            target_path = os.path.join(directory, new_filename)
        
        return target_path

    def create_input(self, label):
        frame = ctk.CTkFrame(self.fields_container, fg_color="transparent")
        frame.pack(fill="x", pady=5)
        ctk.CTkLabel(frame, text=label, width=120, anchor="w", font=ctk.CTkFont(size=14, weight="bold")).pack(side="left", padx=(0, 10))
        entry = ctk.CTkEntry(frame, height=30, corner_radius=0)
        entry.pack(side="right", fill="x", expand=True)
        entry.bind("<KeyRelease>", lambda e: self.on_input_change())
        entry.bind("<Return>", lambda e: e.widget.tk_focusNext().focus())
        return entry
        
    def on_input_change(self, *args):
        self.is_saved = False
        self.update_preview()
        self.enable_save()

    def enable_save(self):
        self.save_btn.configure(state="normal")
        self.save_btn.configure(fg_color="#2ecc71")
        
    def truncate_path(self, path, max_length=40):
        if not path or len(path) <= max_length:
            return path
        # keep the beginning and the end, replace middle with ...
        keep_start = 10
        keep_end = max_length - keep_start - 3
        return f"{path[:keep_start]}...{path[-keep_end:]}"

    def change_save_dir(self):
        new_dir = fd.askdirectory(title="Select Default Save Folder")
        if new_dir:
            self.default_save_dir = new_dir
            self.dir_label.set(f"Dir: {self.truncate_path(self.default_save_dir)}")
            try:
                with open(self.config_file, "w") as f:
                    json.dump({"save_dir": self.default_save_dir}, f)
            except:
                pass
            self.enable_save()
            
    def select_photo(self):
        filename = fd.askopenfilename(title="Select Employee Photo", filetypes=[("Image files", "*.jpg *.png *.jpeg")])
        if filename:
            self.photo_path = filename
            
            # Show a loading window
            self.loading_window = ctk.CTkToplevel(self)
            self.loading_window.title("Processing...")
            self.loading_window.geometry("400x150")
            self.loading_window.overrideredirect(True)
            self.loading_window.configure(fg_color="#1a1a1a")
            
            # Center the window
            self.loading_window.update_idletasks()
            x = self.winfo_x() + (self.winfo_width() // 2) - 200
            y = self.winfo_y() + (self.winfo_height() // 2) - 75
            self.loading_window.geometry(f"+{x}+{y}")
            
            ctk.CTkLabel(self.loading_window, text="Detecting face and cropping...", font=ctk.CTkFont(size=16, weight="bold"), text_color="#ffffff").pack(expand=True)
            
            # Run the heavy processing in a background thread to keep UI responsive
            threading.Thread(target=self._process_photo_logic, args=(False,)).start()

    def remove_bg_action(self):
        if not self.photo_path: return
        
        self.loading_window = ctk.CTkToplevel(self)
        self.loading_window.title("Removing Background...")
        self.loading_window.geometry("400x150")
        self.loading_window.overrideredirect(True)
        self.loading_window.configure(fg_color="#1a1a1a")
        
        self.loading_window.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() // 2) - 200
        y = self.winfo_y() + (self.winfo_height() // 2) - 75
        self.loading_window.geometry(f"+{x}+{y}")
        
        ctk.CTkLabel(self.loading_window, text="Removing Background...", font=ctk.CTkFont(size=16, weight="bold"), text_color="#ffffff").pack(expand=True)
        
        threading.Thread(target=self._process_photo_logic, args=(True,)).start()

    def _process_photo_logic(self, force_bg=False):
        try:
            result = process_employee_photo(self.photo_path, force_bg_remove=force_bg)
            self.processed_photo_path, self._last_error = result
        except Exception as e:
            self.processed_photo_path = self.photo_path
            self._last_error = f"unexpected:{e}"
        
        # Once done, push preview update and UI enable safely in main thread
        self.after(0, self.update_preview)
        self.after(0, lambda: self._finish_photo_processing(force_bg))
        
    def _finish_photo_processing(self, was_bg_removal=False):
        # Close loading window first
        if hasattr(self, 'loading_window') and self.loading_window.winfo_exists():
            self.loading_window.grab_release()
            self.loading_window.destroy()
        
        err = getattr(self, '_last_error', 'ok')
        
        if err == 'no_face':
            self.show_error(
                "Face Not Detected",
                "⚠ No face could be detected in the selected image.\n\n"
                "Please try a clearer, well-lit photo where the face is visible and facing forward."
            )
        elif err == 'no_file':
            self.show_error("File Error", "⚠ The selected image file could not be found.\nPlease select the photo again.")
        elif err == 'quota_exceeded':
            self.show_error(
                "API Quota Exceeded",
                "⚠ Background removal failed.\n\n"
                "Your remove.bg API credits have been exhausted.\n"
                "The ID will be generated with the original cropped photo."
            )
        elif err == 'network_error':
            self.show_error(
                "Network Error",
                "⚠ Could not connect to the background removal service.\n\n"
                "Please check your internet connection and try again."
            )
        elif err == 'invalid_image':
            self.show_error("Invalid Image", "⚠ The image could not be processed by the background removal service.\nPlease try a different photo.")
        elif err not in ('ok', 'ok'):
            if str(err).startswith('unknown') or str(err).startswith('unexpected'):
                self.show_error("Unexpected Error", f"⚠ An unexpected error occurred:\n{err}")
        
        self.enable_save()
        if self.photo_path:
            self.remove_bg_btn.configure(state="normal", fg_color="#ffc107", text_color="black")

    def show_error(self, title, message):
        """Show a centered error dialog."""
        dialog = ctk.CTkToplevel(self)
        dialog.title(title)
        dialog.geometry("420x220")
        dialog.overrideredirect(True)
        dialog.configure(fg_color="#1a1a1a")
        dialog.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() // 2) - 210
        y = self.winfo_y() + (self.winfo_height() // 2) - 110
        dialog.geometry(f"+{x}+{y}")
        ctk.CTkLabel(dialog, text=message, font=ctk.CTkFont(size=13), wraplength=380, justify="left", text_color="#ffffff").pack(expand=True, padx=20)
        ctk.CTkButton(dialog, text="OK", command=dialog.destroy, width=100, corner_radius=0, fg_color="#444444", hover_color="#555555").pack(pady=(0, 15))

    def update_preview_radio(self):
        self.on_input_change()

    def update_preview(self, *args):
        name_am = self.name_am_entry.get()
        name_en = self.name_en_entry.get()
        emp_id = self.id_entry.get()
        position = self.position_entry.get()
        phone = self.phone_entry.get()
        branch = self.branch_var.get()
        orientation = self.orientation_var.get()

        position = position.capitalize()
        name_en = name_en.title()
        
        # Always sync filename with english name or ID as fallback
        base_name = name_en.strip() if name_en.strip() else emp_id.strip()
        self.filename_entry.delete(0, 'end')
        if base_name:
            self.filename_entry.insert(0, base_name)
        
        # Generate front preview
        front_img = generate_id_preview(name_am, name_en, emp_id, phone, branch, self.processed_photo_path, orientation, position)
        
        # Resize for preview display gracefully
        display_size = (400, 600) if orientation == "vertical" else (600, 400)
        front_preview = front_img.resize(display_size, Image.LANCZOS)
        
        front_ctk = ctk.CTkImage(light_image=front_preview, dark_image=front_preview, size=display_size)
        self.canvas_front.configure(image=front_ctk)
        self.canvas_front.image = front_ctk # keep reference
        
        # Generate back preview
        back_img = generate_back_id(orientation)
        back_preview = back_img.resize(display_size, Image.LANCZOS)
        back_ctk = ctk.CTkImage(light_image=back_preview, dark_image=back_preview, size=display_size)
        self.canvas_back.configure(image=back_ctk)
        self.canvas_back.image = back_ctk
        
        # Adjust layout based on orientation
        if orientation == "vertical":
            self.preview_label_back.grid(row=0, column=1, pady=(10, 5))
            self.canvas_back.grid(row=1, column=1, pady=10, padx=10)
        else:
            self.preview_label_back.grid(row=2, column=0, pady=(30, 5))
            self.canvas_back.grid(row=3, column=0, pady=10, padx=10)

    def clear_all(self):
        self.name_am_entry.delete(0, 'end')
        self.name_en_entry.delete(0, 'end')
        self.id_entry.delete(0, 'end')
        self.position_entry.delete(0, 'end')
        self.phone_entry.delete(0, 'end')
        self.filename_entry.delete(0, 'end')
        
        self.branch_var.set(self.branches_list[0])
        self.orientation_var.set("vertical")
        self.photo_path = ""
        self.processed_photo_path = ""
        
        self.update_preview()
        self.save_btn.configure(state="disabled", fg_color="#a0a0a0")
        self.remove_bg_btn.configure(state="disabled", fg_color="#6c757d", text_color="#303030")

    def save_ids(self):
        
        if not self.default_save_dir:
            self.change_save_dir()
            if not self.default_save_dir: # if user cancelled
                return
                
        name_am = self.name_am_entry.get().strip()
        name_en = self.name_en_entry.get().strip()
        emp_id = self.id_entry.get().strip()
        position = self.position_entry.get().strip()
        phone = self.phone_entry.get().strip()
        branch = self.branch_var.get().strip()
        orientation = self.orientation_var.get()
        
        # Validate required fields
        missing = []
        if not name_am: missing.append("Name (Amharic)")
        if not name_en: missing.append("Name (English)")
        if not emp_id: missing.append("ID Number")
        if not position: missing.append("Position")
        if not phone: missing.append("Phone")
        if not self.photo_path: missing.append("Employee Photo")
        
        if missing:
            msg = ctk.CTkToplevel(self)
            msg.title("Missing Information")
            msg.geometry("380x200")
            msg.overrideredirect(True)
            msg.configure(fg_color="#1a1a1a")
            msg.update_idletasks()
            x = self.winfo_x() + (self.winfo_width() // 2) - 190
            y = self.winfo_y() + (self.winfo_height() // 2) - 100
            msg.geometry(f"+{x}+{y}")
            
            ctk.CTkLabel(msg, text="⚠ Please fill in all required fields:", font=ctk.CTkFont(size=14, weight="bold"), text_color="#ffffff").pack(pady=(18, 5))
            ctk.CTkLabel(msg, text="\n".join(f"• {f}" for f in missing), font=ctk.CTkFont(size=13), justify="left", text_color="#e74c3c").pack()
            ctk.CTkButton(msg, text="OK", command=msg.destroy, width=100, corner_radius=0, fg_color="#444444", hover_color="#555555").pack(pady=12)
            return

        
        base_name = self.filename_entry.get()
        if not base_name.strip():
            base_name = "unknown"
            
        front_img = generate_id_preview(name_am, name_en, emp_id, phone, branch, self.processed_photo_path, orientation, position)
        back_img = generate_back_id(orientation)
        
        front_path = self._get_unique_path(self.default_save_dir, f"{base_name}_front.jpg")
        back_path = self._get_unique_path(self.default_save_dir, f"{base_name}_back.jpg")
        
        front_img.save(front_path)
        back_img.save(back_path)
        
        print(f"Saved to {self.default_save_dir}")
        self.save_btn.configure(fg_color="#a0a0a0")
        self.is_saved = True
        self.save_btn.configure(state="disabled")
        self.show_save_notification()

if __name__ == "__main__":
    try:
        app = IDMakerApp()
        app.mainloop()
    except Exception as e:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Crirical Error", f"The application failed to start:\n\n{str(e)}")
        root.destroy()

