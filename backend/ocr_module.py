import pytesseract
import cv2
import numpy as np
import os
import time
import io
from PIL import Image
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class OCRProcessor:
    """Class for processing images and extracting text using OCR"""
    
    def __init__(self, tesseract_cmd: str = None, languages: str = "rus+eng"):
        """
        Initialize OCR processor.
        
        Args:
            tesseract_cmd: Path to Tesseract executable
            languages: Languages for recognition (default: Russian + English)
        """
        self.languages = languages
        
        # Set Tesseract path
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        else:
            # Try to find Tesseract automatically
            self._find_tesseract()
    
    def _find_tesseract(self):
        """Automatic search for Tesseract in standard locations"""
        possible_paths = [
            r"D:\koltcov\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            "tesseract"  # If in PATH
        ]
        
        for path in possible_paths:
            try:
                pytesseract.pytesseract.tesseract_cmd = path
                # Check if it works
                pytesseract.get_tesseract_version()
                logger.info(f"Tesseract found: {path}")
                return
            except:
                continue
        
        logger.warning("Tesseract not found. OCR may not work.")
    
    def preprocess_image(self, image: Image.Image) -> Optional[np.ndarray]:
        """
        Improve image quality for OCR.
        
        Args:
            image: PIL image
            
        Returns:
            Processed image as numpy array or None on error
        """
        try:
            # Convert to numpy array and grayscale
            gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
            
            # Apply CLAHE for contrast enhancement
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            
            # Image binarization
            _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            return binary
            
        except Exception as e:
            logger.error(f"Preprocessing error: {str(e)}")
            return None
    
    def extract_text_from_image(self, image: Image.Image) -> Dict[str, Any]:
        """
        Extract text from image.
        
        Args:
            image: PIL image
            
        Returns:
            Dict with recognition results
        """
        try:
            # Preprocessing
            processed_image = self.preprocess_image(image)
            if processed_image is None:
                return {
                    "success": False,
                    "error": "Image preprocessing error",
                    "text": ""
                }
            
            # Text recognition
            text = pytesseract.image_to_string(
                processed_image,
                lang=self.languages,
                config='--psm 6 --oem 3'
            )
            
            # Text cleaning
            cleaned_text = self._clean_text(text)
            
            return {
                "success": True,
                "error": None,
                "text": cleaned_text,
                "confidence": self._get_confidence(processed_image)
            }
            
        except Exception as e:
            logger.error(f"Error extracting text: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "text": ""
            }
    
    def extract_text_from_file(self, file_path: str) -> Dict[str, Any]:
        """
        Extract text from image file.
        
        Args:
            file_path: Path to image file
            
        Returns:
            Dict with recognition results
        """
        try:
            # Check file existence
            if not os.path.exists(file_path):
                return {
                    "success": False,
                    "error": f"File not found: {file_path}",
                    "text": ""
                }
            
            # Check file extension
            if not self._is_image_file(file_path):
                return {
                    "success": False,
                    "error": "Unsupported file format",
                    "text": ""
                }
            
            # Load image
            image = Image.open(file_path)
            
            # Extract text
            result = self.extract_text_from_image(image)
            result["file_path"] = file_path
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "text": "",
                "file_path": file_path
            }
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text"""
        if not text:
            return ""
        
        # Remove extra spaces and line breaks
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        cleaned_text = '\n'.join(lines)
        
        return cleaned_text
    
    def _get_confidence(self, image: np.ndarray) -> float:
        """Get OCR confidence level"""
        try:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
            return sum(confidences) / len(confidences) if confidences else 0.0
        except:
            return 0.0
    
    def _is_image_file(self, file_path: str) -> bool:
        """Check whether the file is an image."""
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
        _, ext = os.path.splitext(file_path.lower())
        return ext in image_extensions
    
    def get_supported_formats(self) -> list:
        """Get list of supported formats."""
        return ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif']
    
    def is_tesseract_available(self) -> bool:
        """Check Tesseract availability."""
        try:
            pytesseract.get_tesseract_version()
            return True
        except:
            return False

# Global OCR processor instance
ocr_processor = None

def get_ocr_processor() -> OCRProcessor:
    """Return the global OCR processor instance."""
    global ocr_processor
    if ocr_processor is None:
        try:
            from config import get_config
            config = get_config()
            ocr_processor = OCRProcessor(
                tesseract_cmd=config.file_processing.tesseract_cmd,
                languages=config.file_processing.ocr_languages
            )
        except Exception:
            ocr_processor = OCRProcessor()
    return ocr_processor

def extract_text_from_image_file(file_path: str) -> Dict[str, Any]:
    """
    Convenience function to extract text from image file.
    
    Args:
        file_path: Path to image file
        
    Returns:
        Dict with recognition results
    """
    processor = get_ocr_processor()
    return processor.extract_text_from_file(file_path)

def extract_text_from_image_data(image_data: bytes, filename: str = "image.jpg") -> Dict[str, Any]:
    """
    Extract text from image data.
    
    Args:
        image_data: Image byte data
        filename: Filename (for format detection)
        
    Returns:
        Dict with recognition results
    """
    try:
        processor = get_ocr_processor()
        
        # Create PIL image from bytes
        image = Image.open(io.BytesIO(image_data))
        
        # Extract text
        result = processor.extract_text_from_image(image)
        result["filename"] = filename
        
        return result
        
    except Exception as e:
        logger.error(f"Error processing image data: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "text": "",
            "filename": filename
        }
