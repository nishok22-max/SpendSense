from typing import List, Optional, Union
from pydantic import BaseModel

class UserCreate(BaseModel):
    name: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: Union[int, str]
    name: str
    email: str

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TransactionBase(BaseModel):
    date: str
    description: str
    amount: float
    category: str
    confidence: float
    keywords: List[str]

class TransactionResult(TransactionBase):
    id: str

    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    transactions: List[TransactionResult]
    errors: List[dict]

class PredictRequest(BaseModel):
    description: str