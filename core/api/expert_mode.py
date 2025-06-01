"""Expert Mode - Two-phase adaptive expertise system."""

import json
from typing import Dict, Optional, Tuple
from anthropic import Anthropic
from core.config_manager import get_config
from debug.debug_logger import debug


class ExpertModeAnalyzer:
    """Handles phase 1 analysis for expert mode."""
    
    # Phase 1 system prompt - analyzes domain and enhances request
    PHASE1_PROMPT = """You are an expert prompt engineer specializing in domain analysis and request optimization.

Your task is to analyze the user's input and respond ONLY with valid JSON. Do not include any explanatory text, markdown formatting, or comments - ONLY output the JSON object.

Analyze the user's input and provide a JSON response with these exact fields:
{
  "domain": "identified primary domain/field",
  "expert_prompt": "You are a world-class expert in [domain] with [specific expertise]...",
  "enhanced_request": "clarified and enhanced version of the user's input",
  "request_type": "question|task|debug|analysis|creation|other",
  "complexity_notes": "key technical aspects to consider"
}

Requirements for each field:
- domain: The primary field/domain (e.g., "software development", "general conversation", "mathematics", etc.)
- expert_prompt: A 3-5 sentence system prompt establishing exceptional expertise
- enhanced_request: The user's request clarified without changing intent
- request_type: Must be exactly one of: question, task, debug, analysis, creation, other
- complexity_notes: Brief technical considerations

Remember: Output ONLY the JSON object. No additional text before or after."""

    def __init__(self, client: Anthropic):
        self.client = client
        self.config = get_config()
        
    async def analyze_request(self, user_input: str, model: str) -> Optional[Dict]:
        """
        Phase 1: Analyze user input to determine domain and enhance request.
        
        Args:
            user_input: The original user message
            model: The model to use for analysis
            
        Returns:
            Dict with domain, expert_prompt, enhanced_request, or None on error
        """
        try:
            debug.log(
                event="expert_mode_phase1_start",
                data={
                    "input_length": len(user_input),
                    "model": model
                },
                category="EXPERT_MODE"
            )
            
            # Create the analysis request
            messages = [{
                "role": "user",
                "content": user_input
            }]
            
            # Get max tokens for phase 1
            max_tokens = self.config.get('ai.expert_mode.settings.phase1_max_tokens', 1000)
            
            # Make the API call without streaming
            response = self.client.messages.create(
                model=model,
                messages=messages,
                system=self.PHASE1_PROMPT,
                max_tokens=max_tokens,
                temperature=0.3  # Lower temperature for more consistent analysis
            )
            
            # Extract and parse the response
            content = response.content[0].text if response.content else ""
            
            debug.log(
                event="expert_mode_phase1_response",
                data={
                    "response_length": len(content),
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    }
                },
                category="EXPERT_MODE"
            )
            
            # Parse JSON response
            try:
                # Clean the content to handle potential JSON issues
                # Strip whitespace and remove any non-JSON content
                cleaned_content = content.strip()
                
                # If the content starts with markdown code block, extract JSON
                if cleaned_content.startswith("```json"):
                    cleaned_content = cleaned_content[7:]  # Remove ```json
                    if cleaned_content.endswith("```"):
                        cleaned_content = cleaned_content[:-3]  # Remove ```
                elif cleaned_content.startswith("```"):
                    cleaned_content = cleaned_content[3:]  # Remove ```
                    if cleaned_content.endswith("```"):
                        cleaned_content = cleaned_content[:-3]  # Remove ```
                
                # Further clean and try to extract JSON object
                cleaned_content = cleaned_content.strip()
                
                # Try to find JSON object in the content
                if "{" in cleaned_content and "}" in cleaned_content:
                    # Find the first { and last }
                    start = cleaned_content.find("{")
                    end = cleaned_content.rfind("}") + 1
                    cleaned_content = cleaned_content[start:end]
                
                analysis = json.loads(cleaned_content)
                
                # Validate required fields
                required_fields = ["domain", "expert_prompt", "enhanced_request"]
                if all(field in analysis for field in required_fields):
                    debug.log(
                        event="expert_mode_analysis_success",
                        data={
                            "domain": analysis.get("domain"),
                            "request_type": analysis.get("request_type", "unknown"),
                            "enhanced_length": len(analysis.get("enhanced_request", "")),
                            "expert_prompt_preview": analysis.get("expert_prompt", "")[:100] + "..."
                        },
                        category="EXPERT_MODE"
                    )
                    return analysis
                else:
                    debug.log(
                        event="expert_mode_phase1_invalid_response",
                        data={"missing_fields": [f for f in required_fields if f not in analysis]},
                        category="EXPERT_MODE"
                    )
                    return None
                    
            except json.JSONDecodeError as e:
                debug.log(
                    event="expert_mode_phase1_parse_error",
                    data={
                        "error": str(e), 
                        "content_preview": content[:500] if content else "No content",
                        "content_length": len(content) if content else 0,
                        "full_content": content  # Log full content for debugging
                    },
                    category="EXPERT_MODE"
                )
                print(f"[EXPERT MODE] JSON Parse Error: {e}")
                print(f"[EXPERT MODE] Content received: {content[:500]}...")
                return None
                
        except Exception as e:
            debug.log(
                event="expert_mode_phase1_error",
                data={"error": str(e)},
                category="EXPERT_MODE"
            )
            return None
            
    def enhance_system_prompt(self, original_prompt: str, expert_extension: str) -> str:
        """
        Combine original system prompt with expert extension for phase 2.
        
        Args:
            original_prompt: The base system prompt
            expert_extension: The domain-specific expert prompt
            
        Returns:
            Combined system prompt
        """
        # Combine prompts
        enhanced_prompt = f"{original_prompt}\n\n## Domain Expertise\n{expert_extension}"
        
        # Print summary for immediate visibility
        print(f"[EXPERT MODE] System Prompt Enhancement:")
        print(f"  Original length: {len(original_prompt)} chars")
        print(f"  Extension length: {len(expert_extension)} chars") 
        print(f"  Total length: {len(enhanced_prompt)} chars")
        print(f"  Enhancement ratio: {round(len(expert_extension) / len(original_prompt), 2)}")
        print(f"[EXPERT MODE] Expert Extension Preview: {expert_extension[:100]}...")
        
        # Log the enhancement summary (without full prompt content)
        debug.log(
            event="expert_mode_enhancement_summary",
            data={
                "total_length": len(enhanced_prompt),
                "original_length": len(original_prompt),
                "extension_length": len(expert_extension),
                "enhancement_ratio": round(len(expert_extension) / len(original_prompt), 2),
                "extension_preview": expert_extension[:100] + "..." if len(expert_extension) > 100 else expert_extension
            },
            category="EXPERT_MODE"
        )
        
        return enhanced_prompt