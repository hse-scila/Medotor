"""
Backend server for model inference using TorchLama
Mimics llama.cpp functionality in LM Studio
"""

import torch
import json
import asyncio
import os
from typing import Dict, List, Optional, Any
import logging
from pathlib import Path
from config import get_config

# Check TorchLama environment
TORCHLAMA_ENV_AVAILABLE = False
try:
    if 'CONDA_DEFAULT_ENV' in os.environ and 'torchlama' in os.environ['CONDA_DEFAULT_ENV'].lower():
        TORCHLAMA_ENV_AVAILABLE = True
        print("[OK] Окружение TorchLama активно")
    else:
        print("[WARNING] Окружение TorchLama не активно")
except Exception as e:
    print(f"[WARNING] Не удалось определить окружение: {e}")

# Import libraries
try:
    from transformers import AutoTokenizer, AutoModelForCausalLM
    TRANSFORMERS_AVAILABLE = True
    print("[OK] Transformers импортирован успешно")
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("[WARNING] Transformers не найден")

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelManager:
    """Manager for loading and managing models"""
    
    def __init__(self):
        self.current_model = None
        self.current_tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_cache = {}
        self.use_torchlama_env = TORCHLAMA_ENV_AVAILABLE
        self.transformers_available = TRANSFORMERS_AVAILABLE
        
        if not self.transformers_available:
            logger.error("Transformers не доступен! Установите: pip install transformers")
        
    def load_model(self, model_name: str, model_path: Optional[str] = None):
        """Loads model into memory"""
        try:
            logger.info(f"Начинаем загрузку модели: {model_name}")
            logger.info(f"Устройство: {self.device}")
            logger.info(f"Transformers доступен: {self.transformers_available}")
            logger.info(f"Окружение TorchLama: {self.use_torchlama_env}")
            
            if not self.transformers_available:
                logger.error("Transformers не доступен!")
                return False
            
            # Use Transformers (TorchLama environment optimizes PyTorch)
            result = self._load_transformers_model(model_name, model_path)
            logger.info(f"Результат загрузки модели {model_name}: {result}")
            return result
                
        except Exception as e:
            logger.error(f"Критическая ошибка загрузки модели {model_name}: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
    
    def _load_transformers_model(self, model_name: str, model_path: Optional[str] = None):
        """Load model via Transformers in TorchLama environment"""
        try:
            if self.use_torchlama_env:
                logger.info("Используем Transformers в окружении TorchLama (оптимизированное)")
            else:
                logger.info("Используем Transformers в стандартном окружении")
            
            if model_path:
                # Load local model
                tokenizer = AutoTokenizer.from_pretrained(model_path)
                model = AutoModelForCausalLM.from_pretrained(
                    model_path,
                    torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                    device_map="auto" if self.device == "cuda" else None
                )
            else:
                # Load model from Hugging Face
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                    device_map="auto" if self.device == "cuda" else None
                )
            
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token
            
            self.current_model = model
            self.current_tokenizer = tokenizer
            self.model_cache[model_name] = {
                "model": model,
                "tokenizer": tokenizer
            }
            
            env_info = "TorchLama" if self.use_torchlama_env else "стандартное"
            logger.info(f"Модель {model_name} успешно загружена в окружении {env_info} на {self.device}")
            return True
            
        except Exception as e:
            logger.error(f"Ошибка загрузки через Transformers: {str(e)}")
            return False
    
    def generate_text(
        self, 
        prompt: str, 
        max_tokens: int = 100,
        temperature: float = 0.7,
        top_p: float = 0.9,
        top_k: int = 50
    ) -> str:
        """Generates text based on prompt"""
        
        if not self.current_model or not self.current_tokenizer:
            return "Ошибка: модель не загружена"
        
        try:
            # Generate via Transformers (in TorchLama or standard environment)
            return self._generate_transformers(prompt, max_tokens, temperature, top_p, top_k)
                
        except Exception as e:
            logger.error(f"Ошибка генерации текста: {str(e)}")
            return f"Ошибка генерации: {str(e)}"
    
    def generate_text_stream(
        self, 
        prompt: str, 
        max_tokens: int = 100,
        temperature: float = 0.7,
        top_p: float = 0.9,
        top_k: int = 50
    ):
        """Simple streaming generation emulation"""
        
        if not self.current_model or not self.current_tokenizer:
            yield "Ошибка: модель не загружена"
            return
        
        try:
            # Generate full text at once
            full_text = self.generate_text(prompt, max_tokens, temperature, top_p, top_k)
            
            if not full_text or not full_text.strip():
                yield "Модель не смогла сгенерировать ответ"
                return
            
            # Split into words for streaming emulation
            words = full_text.split()
            for i, word in enumerate(words):
                if i == 0:
                    yield word
                else:
                    yield " " + word
                    
        except Exception as e:
            logger.error(f"Ошибка потоковой генерации текста: {str(e)}")
            yield f"Ошибка генерации: {str(e)}"
    
    def _generate_transformers(self, prompt: str, max_tokens: int, temperature: float, top_p: float, top_k: int) -> str:
        """Generate text via Transformers"""
        try:
            # Tokenize input text
            inputs = self.current_tokenizer.encode(prompt, return_tensors="pt")
            inputs = inputs.to(self.device)
            
            # Generate text
            with torch.no_grad():
                outputs = self.current_model.generate(
                    inputs,
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    do_sample=True,
                    pad_token_id=self.current_tokenizer.eos_token_id,
                    eos_token_id=self.current_tokenizer.eos_token_id
                )
            
            # Decode result
            generated_text = self.current_tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Remove original prompt from result
            if generated_text.startswith(prompt):
                generated_text = generated_text[len(prompt):].strip()
            
            return generated_text
            
        except Exception as e:
            logger.error(f"Ошибка генерации через Transformers: {str(e)}")
            return f"Ошибка генерации: {str(e)}"
    
    def _generate_transformers_stream(self, prompt: str, max_tokens: int, temperature: float, top_p: float, top_k: int):
        """Streaming text generation via Transformers"""
        try:
            # Tokenize input text
            inputs = self.current_tokenizer.encode(prompt, return_tensors="pt")
            inputs = inputs.to(self.device)
            
            # Simple streaming generation - generate in parts
            generated_text = ""
            current_inputs = inputs
            
            with torch.no_grad():
                for i in range(max_tokens):
                    # Generate one token
                    outputs = self.current_model.generate(
                        current_inputs,
                        max_new_tokens=1,
                        temperature=temperature,
                        top_p=top_p,
                        top_k=top_k,
                        do_sample=True,
                        pad_token_id=self.current_tokenizer.eos_token_id,
                        eos_token_id=self.current_tokenizer.eos_token_id,
                        return_dict_in_generate=True
                    )
                    
                    # Get new token
                    new_token = outputs.sequences[0][-1]
                    
                    # Check for generation end
                    if new_token == self.current_tokenizer.eos_token_id:
                        break
                    
                    # Decode new token
                    new_text = self.current_tokenizer.decode([new_token], skip_special_tokens=True)
                    
                    if new_text:
                        generated_text += new_text
                        yield new_text
                        
                        # Update inputs for next iteration
                        current_inputs = outputs.sequences
                    else:
                        break
            
        except Exception as e:
            logger.error(f"Ошибка потоковой генерации через Transformers: {str(e)}")
            yield f"Ошибка генерации: {str(e)}"
    
    def get_model_info(self) -> Dict[str, Any]:
        """Returns information about current model"""
        if not self.current_model:
            return {"status": "no_model_loaded"}
        
        info = {
            "status": "model_loaded",
            "device": self.device,
            "model_type": type(self.current_model).__name__,
            "environment": "TorchLama" if self.use_torchlama_env else "Standard",
            "backend": "Transformers",
            "memory_usage": torch.cuda.memory_allocated() if self.device == "cuda" else 0
        }
        
        # Count parameters
        try:
            if hasattr(self.current_model, 'parameters'):
                info["parameters"] = sum(p.numel() for p in self.current_model.parameters())
            elif hasattr(self.current_model, 'model') and hasattr(self.current_model.model, 'parameters'):
                info["parameters"] = sum(p.numel() for p in self.current_model.model.parameters())
            else:
                info["parameters"] = "unknown"
        except Exception:
            info["parameters"] = "unknown"
        
        return info

# Global model manager instance
model_manager = ModelManager()

# Ollama models (local) - only actually available
OLLAMA_MODELS = {
    "qwen2.5:latest": "Qwen 2.5 Latest - Ollama (рекомендуемая)",
    "llama3.2:latest": "Llama 3.2 Latest - Ollama",
    "llama3.2:1b": "Llama 3.2 1B - Ollama",
    "gemma3:1b": "Gemma 3 1B - Ollama",
    "gemma3n:e4b": "Gemma 3N E4B - Ollama",
    "deepseek-r1:1.5b": "DeepSeek R1 1.5B - Ollama",
    "deepseek-r1:14b": "DeepSeek R1 14B - Ollama",
    "cogito:3b": "Cogito 3B - Ollama",
    "medllama2:latest": "MedLlama2 Latest - Ollama",
    "meditron:latest": "Meditron Latest - Ollama",
    "o3s/chatbot:latest": "O3S Chatbot Latest - Ollama",
    "OussamaELALLAM/MedExpert:latest": "MedExpert Latest - Ollama",
    "cabelo/clinical-br-llama-2-7b:latest": "Clinical BR Llama2 7B - Ollama",
    "chatgph/medix-ph:latest": "Medix PH Latest - Ollama",
    "internlm/internlm3-8b-instruct:latest": "InternLM3 8B Instruct - Ollama",
    "electricalgorithm/hippomistral:latest": "HippoMistral Latest - Ollama",
    "alibayram/med-alpaca-2-7b-chat:latest": "Med Alpaca2 7B Chat - Ollama",
    "thewindmom/llama3-med42-8b:latest": "Llama3 Med42 8B - Ollama",
    "openbmb/minicpm-v4.5:latest": "MiniCPM V4.5 Latest - Ollama",
    "gpt-oss:20b": "GPT-OSS 20B - Ollama"
}

# Fallback models for Transformers
TRANSFORMERS_MODELS = {
    "microsoft/DialoGPT-small": "Диалоговая модель (117M параметров)",
    "distilgpt2": "GPT-2 Distil (82M параметров)",
    "gpt2": "GPT-2 (124M параметров)"
}

def get_available_models() -> Dict[str, str]:
    """Returns list of available Ollama models"""
    return OLLAMA_MODELS

async def get_real_ollama_models() -> Dict[str, str]:
    """Returns only actually available models from Ollama"""
    try:
        import httpx
        config = get_config()
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{config.ollama.url}/api/tags")
            if response.status_code != 200:
                logger.error(f"Не удалось подключиться к Ollama: {response.status_code}")
                return {}
            
            models = response.json().get("models", [])
            available_models = {}
            
            # Return all locally installed models, not just from OLLAMA_MODELS
            for model in models:
                model_name = model["name"]
                # Use description from OLLAMA_MODELS if available, otherwise create basic description
                description = OLLAMA_MODELS.get(model_name, f"Local Ollama model: {model_name}")
                available_models[model_name] = description
            
            logger.info(f"Найдено {len(available_models)} локально установленных моделей Ollama")
            return available_models
            
    except Exception as e:
        logger.error(f"Ошибка при получении списка моделей Ollama: {e}")
        return {}

async def load_preset_model(model_name: str) -> bool:
    """Loads Ollama model"""
    # Check that model is locally installed
    local_models = await get_real_ollama_models()
    if model_name not in local_models:
        logger.error(f"Модель {model_name} не найдена среди локально установленных моделей")
        logger.info(f"Локально установленные модели: {list(local_models.keys())}")
        return False
    
    # For Ollama models perform real loading via API
    try:
        import httpx
        config = get_config()
        
        # Extended timeout for large models (5 minutes)
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Check that model is available
            response = await client.get(f"{config.ollama.url}/api/tags")
            if response.status_code != 200:
                logger.error(f"Не удалось подключиться к Ollama: {response.status_code}")
                return False
            
            models = response.json().get("models", [])
            available_models = [model["name"] for model in models]
            
            if model_name not in available_models:
                logger.error(f"Модель {model_name} не найдена в Ollama")
                logger.info(f"Доступные модели в Ollama: {available_models}")
                return False
            
            # Load model (make request for "warming up")
            logger.info(f"Loading model {model_name} in Ollama... (this may take several minutes for large models)")
            
            # First try to load model via /api/pull (if needed)
            try:
                pull_response = await client.post(
                    f"{config.ollama.url}/api/pull",
                    json={"name": model_name},
                    timeout=300.0  # Extended timeout for loading
                )
                if pull_response.status_code == 200:
                    logger.info(f"Модель {model_name} загружена из репозитория")
            except Exception as e:
                logger.info(f"Model {model_name} is already available locally or loading error: {e}")
            
            # Now make test request for warming up
            # Use extended timeout for large models
            load_response = await client.post(
                f"{config.ollama.url}/api/generate",
                json={
                    "model": model_name,
                    "prompt": "Hello",
                    "stream": False,
                    "options": {
                        "num_predict": 1
                    }
                }
            )
            
            if load_response.status_code == 200:
                logger.info(f"Модель {model_name} успешно загружена в Ollama")
                return True
            else:
                logger.error(f"Ошибка загрузки модели {model_name}: {load_response.status_code}")
                return False
        
    except Exception as e:
        logger.error(f"Ошибка при загрузке модели {model_name}: {e}")
        return False

if __name__ == "__main__":
    # Testing
    print("ModelManager initialization...")
    print(f"Окружение TorchLama активно: {TORCHLAMA_ENV_AVAILABLE}")
    print(f"Transformers доступен: {TRANSFORMERS_AVAILABLE}")
    
    available_models = get_available_models()
    print(f"Available models: {list(available_models.keys())}")
    
    # Load test model
    test_model = "distilgpt2"
    if load_preset_model(test_model):
        print(f"Model {test_model} loaded successfully!")
        
        # Test generation
        test_prompt = "Hello, how are you?"
        result = model_manager.generate_text(test_prompt, max_tokens=50)
        print(f"Generation test: {result}")
        
        # Model information
        info = model_manager.get_model_info()
        print(f"Model information: {info}")
    else:
        print("Ошибка загрузки модели")
