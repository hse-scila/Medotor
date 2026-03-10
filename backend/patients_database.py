"""
Module for working with patients database
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class PatientsDatabase:
    """Class for working with patients database"""
    
    def __init__(self, db_path: str = None):
        # If path not specified, try to get from configuration
        if db_path is None:
            try:
                from config import get_config
                config = get_config()
                db_path = config.database.sqlite_path
                logger.info(f"Using database path from config: {db_path}")
            except Exception as e:
                logger.warning(f"Failed to load config, using default path: {e}")
                db_path = "data/patients.db"
        
        # Use absolute path for reliability
        if not Path(db_path).is_absolute():
            # Relative path - ALWAYS determine project root relative to this file
            import os
            # Determine project root as directory containing backend/
            # This file is located in backend/patients_database.py
            this_file = Path(__file__).resolve()
            backend_dir = this_file.parent  # backend/
            project_root = backend_dir.parent  # project root
            
            # Verify we're actually in project root
            if not (project_root / "backend").exists():
                # If something went wrong, use backend_dir as fallback
                logger.warning(f"Failed to determine project root, using backend_dir: {backend_dir}")
                project_root = backend_dir
            
            self.db_path = project_root / db_path
            logger.info(f"Project root determined: {project_root}")
            logger.info(f"Final database path: {self.db_path.absolute()}")
        else:
            self.db_path = Path(db_path)
        
        # Create directory if it doesn't exist
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"Database path: {self.db_path.absolute()}")
            logger.info(f"Database file exists: {self.db_path.exists()}")
        except Exception as e:
            logger.error(f"Error creating database directory: {e}")
            logger.error(f"   Target path: {self.db_path.absolute()}")
            raise
        
        self.init_database()
    
    def init_database(self):
        """Initialize database"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Create patients table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS patients (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        age INTEGER,
                        gender TEXT,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create documents table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        patient_id INTEGER NOT NULL,
                        document_type TEXT NOT NULL,
                        content TEXT NOT NULL,
                        filename TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
                    )
                """)
                
                # Create indexes for fast search
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (name)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_patient_id ON documents (patient_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (document_type)")
                
                # Migration: add filename field if it doesn't exist
                try:
                    cursor.execute("ALTER TABLE documents ADD COLUMN filename TEXT")
                    logger.info("Added filename field to documents table")
                except sqlite3.OperationalError:
                    # Field already exists
                    pass
                
                conn.commit()
                logger.info("Patients database initialized")
                
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            raise
    
    def add_patient(self, name: str, age: Optional[int] = None, gender: Optional[str] = None, notes: Optional[str] = None) -> int:
        """Add new patient"""
        try:
            logger.info(f"Saving patient '{name}' to database: {self.db_path.absolute()}")
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO patients (name, age, gender, notes)
                    VALUES (?, ?, ?, ?)
                """, (name, age, gender, notes))
                
                patient_id = cursor.lastrowid
                conn.commit()
                
                logger.info(f"✓ Patient saved: {name} (ID: {patient_id}) to database: {self.db_path.absolute()}")
                
                # Additional check - read back for confirmation
                cursor.execute("SELECT COUNT(*) FROM patients")
                total_count = cursor.fetchone()[0]
                logger.info(f"  Total patients in database now: {total_count}")
                
                return patient_id
                
        except Exception as e:
            logger.error(f"Error adding patient '{name}': {e}")
            logger.error(f"  Database path: {self.db_path.absolute()}")
            logger.error(f"  Database exists: {self.db_path.exists()}")
            raise
    
    def get_patient(self, patient_id: int) -> Optional[Dict[str, Any]]:
        """Get patient information"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
                row = cursor.fetchone()
                
                if row:
                    return dict(row)
                return None
                
        except Exception as e:
            logger.error(f"Error getting patient: {e}")
            raise
    
    def get_all_patients(self) -> List[Dict[str, Any]]:
        """Get list of all patients"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("SELECT * FROM patients ORDER BY created_at DESC")
                rows = cursor.fetchall()
                
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error getting patient list: {e}")
            raise
    
    def update_patient(self, patient_id: int, name: Optional[str] = None, age: Optional[int] = None, 
                      gender: Optional[str] = None, notes: Optional[str] = None) -> bool:
        """Update patient information"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Build dynamic query
                updates = []
                params = []
                
                if name is not None:
                    updates.append("name = ?")
                    params.append(name)
                if age is not None:
                    updates.append("age = ?")
                    params.append(age)
                if gender is not None:
                    updates.append("gender = ?")
                    params.append(gender)
                if notes is not None:
                    updates.append("notes = ?")
                    params.append(notes)
                
                if not updates:
                    return False
                
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(patient_id)
                
                cursor.execute(f"""
                    UPDATE patients 
                    SET {', '.join(updates)}
                    WHERE id = ?
                """, params)
                
                conn.commit()
                
                if cursor.rowcount > 0:
                    logger.info(f"Updated patient ID: {patient_id}")
                    return True
                return False
                
        except Exception as e:
            logger.error(f"Error updating patient: {e}")
            raise
    
    def delete_patient(self, patient_id: int) -> bool:
        """Delete patient and all their documents"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Delete patient documents (CASCADE should work automatically)
                cursor.execute("DELETE FROM documents WHERE patient_id = ?", (patient_id,))
                
                # Delete patient
                cursor.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
                
                conn.commit()
                
                if cursor.rowcount > 0:
                    logger.info(f"Deleted patient ID: {patient_id}")
                    return True
                return False
                
        except Exception as e:
            logger.error(f"Error deleting patient: {e}")
            raise
    
    def add_document(self, patient_id: int, document_type: str, content: str, filename: str = None) -> int:
        """Add document to patient"""
        try:
            logger.debug(f"Saving document for patient {patient_id} to database: {self.db_path.absolute()}")
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO documents (patient_id, document_type, content, filename)
                    VALUES (?, ?, ?, ?)
                """, (patient_id, document_type, content, filename))
                
                document_id = cursor.lastrowid
                conn.commit()
                
                logger.info(f"✓ Document saved: patient {patient_id}, document ID: {document_id}, file: {filename}")
                
                # Additional check
                cursor.execute("SELECT COUNT(*) FROM documents WHERE patient_id = ?", (patient_id,))
                doc_count = cursor.fetchone()[0]
                logger.debug(f"  Total documents for patient {patient_id}: {doc_count}")
                
                return document_id
                
        except Exception as e:
            logger.error(f"Error adding document for patient {patient_id}: {e}")
            logger.error(f"  Database path: {self.db_path.absolute()}")
            raise
    
    def get_patient_documents(self, patient_id: int) -> List[Dict[str, Any]]:
        """Get all patient documents"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT * FROM documents 
                    WHERE patient_id = ? 
                    ORDER BY created_at DESC
                """, (patient_id,))
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error getting patient documents: {e}")
            raise
    
    def delete_document(self, document_id: int) -> bool:
        """Delete document"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM documents WHERE id = ?", (document_id,))
                conn.commit()
                
                if cursor.rowcount > 0:
                    logger.info(f"Deleted document ID: {document_id}")
                    return True
                return False
                
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            raise
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get database statistics"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Number of patients
                cursor.execute("SELECT COUNT(*) FROM patients")
                patients_count = cursor.fetchone()[0]
                
                # Number of documents
                cursor.execute("SELECT COUNT(*) FROM documents")
                documents_count = cursor.fetchone()[0]
                
                # Statistics by document types
                cursor.execute("""
                    SELECT document_type, COUNT(*) as count 
                    FROM documents 
                    GROUP BY document_type 
                    ORDER BY count DESC
                """)
                document_types = dict(cursor.fetchall())
                
                return {
                    "patients_count": patients_count,
                    "documents_count": documents_count,
                    "document_types": document_types,
                    "database_path": str(self.db_path),
                    "database_exists": self.db_path.exists()
                }
                
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            raise
    
    def clear_database(self) -> bool:
        """Complete database cleanup"""
        logger.info("DEBUG: Starting patients database cleanup")
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Get statistics before cleanup
                cursor.execute("SELECT COUNT(*) FROM patients")
                patients_count_before = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM documents")
                documents_count_before = cursor.fetchone()[0]
                
                logger.info(f"DEBUG: Before cleanup - patients: {patients_count_before}, documents: {documents_count_before}")
                
                # Delete all documents
                cursor.execute("DELETE FROM documents")
                deleted_documents = cursor.rowcount
                logger.info(f"DEBUG: Deleted documents: {deleted_documents}")
                
                # Delete all patients
                cursor.execute("DELETE FROM patients")
                deleted_patients = cursor.rowcount
                logger.info(f"DEBUG: Deleted patients: {deleted_patients}")
                
                # Reset auto-increment
                cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('patients', 'documents')")
                logger.info("DEBUG: Auto-increment reset")
                
                conn.commit()
                logger.info("DEBUG: Changes committed to database")
                
                logger.info("Patients database completely cleared")
                return True
                
        except Exception as e:
            logger.error(f"Error clearing database: {e}")
            raise
    
    def search_patients(self, query: str) -> List[Dict[str, Any]]:
        """Search patients by name or notes"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                search_query = f"%{query}%"
                cursor.execute("""
                    SELECT * FROM patients 
                    WHERE name LIKE ? OR notes LIKE ?
                    ORDER BY created_at DESC
                """, (search_query, search_query))
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error searching patients: {e}")
            raise
