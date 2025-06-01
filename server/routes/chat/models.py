from pydantic import BaseModel, ConfigDict

class ChatResetRequest(BaseModel):
    session_id: str

    model_config = ConfigDict(
        json_schema_extra = {
            "example": {
                "session_id": "123e4567-e89b-12d3-a456-426614174000"
            }
        }
    )