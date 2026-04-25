"""CV Parser using LLM to extract structured data from CV text."""

import os
import json
import re
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

_llm = ChatOllama(
    model=os.getenv("OLLAMA_MODEL", "llama3.2"),
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    format="json",
    temperature=0.1,
)


def parse_cv_text(cv_text: str) -> dict:
    """Parse CV text and extract structured information using LLM.
    
    Args:
        cv_text: Raw text extracted from CV (PDF/DOCX/Image)
        
    Returns:
        dict with: name, email, phone, skills, experience_years, seniority, education
    """
    
    prompt = f"""
You are an expert CV parser. Extract the following information from this CV text with high accuracy.
If a field is not found, return null.

CV Text:
{cv_text}

Extract and return JSON with these exact fields:
{{
  "name": "Full name of the candidate",
  "email": "Email address (must contain @ symbol)",
  "phone": "Phone number with country code",
  "skills": ["List", "of", "technical", "skills"],
  "experience_years": 5,
  "seniority": "junior|mid|senior|lead",
  "education": "Highest degree and institution"
}}

CRITICAL RULES:
1. EMAIL: Must contain @ symbol (e.g., name@email.com). Do NOT confuse with phone numbers.
2. PHONE: Must be a phone number with digits, parentheses, dashes, or + (e.g., +1 415 555 0192, (415) 555-0192). Do NOT confuse with email.
3. SENIORITY: Calculate from experience: 0-2 years = junior, 3-5 = mid, 6-10 = senior, 10+ = lead
4. SKILLS: Extract ONLY technical skills (programming languages, frameworks, tools, databases). Exclude soft skills.
5. EXPERIENCE_YEARS: Extract the total years of professional experience as an integer.
6. Return ONLY valid JSON, no additional text.

Double-check that email contains @ and phone contains digits before returning.
"""
    
    try:
        resp = _llm.invoke([HumanMessage(content=prompt)])
        data = json.loads(resp.content)
        
        # Validate and clean data with regex checks
        import re
        
        email = data.get("email")
        phone = data.get("phone")
        
        # Validate email format
        if email and '@' not in email:
            # Try to find email in the text
            email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', cv_text)
            email = email_match.group(0) if email_match else None
        
        # Validate phone format (should contain digits)
        if phone and not re.search(r'\d', phone):
            # Try to find phone in the text
            phone_match = re.search(r'[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]', cv_text)
            phone = phone_match.group(0) if phone_match else None
        
        return {
            "name": data.get("name") or "Unknown",
            "email": email,
            "phone": phone,
            "skills": data.get("skills") or [],
            "experience_years": data.get("experience_years"),
            "seniority": data.get("seniority") or "mid",
            "education": data.get("education"),
        }
    except Exception as e:
        print(f"CV parsing error: {e}")
        # Fallback: try regex extraction
        import re
        email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', cv_text)
        phone_match = re.search(r'[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]', cv_text)
        
        return {
            "name": "Unknown",
            "email": email_match.group(0) if email_match else None,
            "phone": phone_match.group(0) if phone_match else None,
            "skills": [],
            "experience_years": None,
            "seniority": "mid",
            "education": None,
        }


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file."""
    try:
        import PyPDF2
        with open(file_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            text = ""
            for page in reader.pages:
                text += page.extract_text()
            return text
    except Exception as e:
        print(f"PDF extraction error: {e}")
        return ""


def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX file."""
    try:
        import docx
        doc = docx.Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        print(f"DOCX extraction error: {e}")
        return ""


def extract_text_from_image(file_path: str) -> str:
    """Extract text from image file using OCR (Tesseract).
    
    Supports: JPG, JPEG, PNG, BMP, TIFF
    """
    try:
        from PIL import Image
        import pytesseract
        
        # Open image
        image = Image.open(file_path)
        
        # Perform OCR
        text = pytesseract.image_to_string(image, lang='eng+fra')
        
        return text
    except ImportError:
        print("OCR libraries not installed. Install: pip install pytesseract pillow")
        print("Also install Tesseract OCR: brew install tesseract (macOS) or apt-get install tesseract-ocr (Linux)")
        return ""
    except Exception as e:
        print(f"Image OCR error: {e}")
        return ""
