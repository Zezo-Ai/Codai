#!/usr/bin/env python3
"""
Extended Thinking Budget Analyzer

This script analyzes extended thinking token usage across different task types
to help optimize budget settings and reduce token costs.
"""

import os
import sys
import json
import argparse
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Dict, List, Optional

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from core.metrics.thinking_tokens import thinking_token_metrics
from debug.debug_logger import debug

def load_thinking_data_from_logs(log_dir: str = None) -> pd.DataFrame:
    """Load thinking token usage data from logs."""
    if log_dir is None:
        log_dir = os.path.join(PROJECT_ROOT, "logs")
    
    log_path = Path(log_dir)
    data = []
    
    # Process all debug logs
    for log_file in log_path.glob("debug_*.log"):
        with open(log_file, "r") as f:
            for line in f:
                try:
                    # Parse JSON log entry
                    entry = json.loads(line.strip())
                    
                    # Check if it's an extended thinking log
                    if (entry.get("category") == "EXTENDED_THINKING" 
                            and entry.get("event") == "thinking_token_usage"):
                        data.append({
                            "timestamp": entry.get("timestamp"),
                            "session_id": entry.get("session_id", "unknown"),
                            "thinking_tokens": entry.get("data", {}).get("thinking_tokens", 0),
                            "thinking_budget": entry.get("data", {}).get("thinking_budget", 0),
                            "thinking_percentage": entry.get("data", {}).get("thinking_percentage", 0),
                            "task_type": entry.get("data", {}).get("task_type", "unknown"),
                            "prompt_length": entry.get("data", {}).get("prompt_length", 0)
                        })
                except:
                    # Skip invalid entries
                    continue
    
    return pd.DataFrame(data)

def analyze_thinking_efficiency(df: pd.DataFrame) -> Dict:
    """Analyze thinking token efficiency across different task types."""
    if df.empty:
        return {}
    
    result = {
        "overall": {
            "avg_tokens": df["thinking_tokens"].mean(),
            "median_tokens": df["thinking_tokens"].median(),
            "max_tokens": df["thinking_tokens"].max(),
            "avg_percentage": df["thinking_percentage"].mean() * 100,
            "count": len(df)
        },
        "by_task_type": {}
    }
    
    # Analyze by task type
    for task_type, group in df.groupby("task_type"):
        p95 = group["thinking_tokens"].quantile(0.95)
        suggested_budget = min(int(p95 * 1.2), 64000)
        suggested_budget = max(suggested_budget, 1024)
        suggested_budget = ((suggested_budget + 500) // 1000) * 1000
        
        result["by_task_type"][task_type] = {
            "avg_tokens": group["thinking_tokens"].mean(),
            "median_tokens": group["thinking_tokens"].median(),
            "p95_tokens": p95,
            "max_tokens": group["thinking_tokens"].max(),
            "avg_percentage": group["thinking_percentage"].mean() * 100,
            "count": len(group),
            "suggested_budget": suggested_budget,
            "potential_savings": group["thinking_budget"].mean() - suggested_budget
        }
    
    return result

def generate_visualizations(df: pd.DataFrame, output_dir: str) -> None:
    """Generate visualizations of thinking token usage."""
    if df.empty:
        print("No data available for visualization")
        return
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Plot thinking tokens distribution
    plt.figure(figsize=(10, 6))
    plt.hist(df["thinking_tokens"], bins=20, alpha=0.7, color="skyblue")
    plt.title("Distribution of Thinking Tokens Used")
    plt.xlabel("Thinking Tokens")
    plt.ylabel("Frequency")
    plt.savefig(os.path.join(output_dir, "thinking_tokens_distribution.png"))
    
    # 2. Plot by task type
    plt.figure(figsize=(12, 8))
    task_groups = df.groupby("task_type")["thinking_tokens"].mean().sort_values(ascending=False)
    task_groups.plot(kind="bar", color="teal")
    plt.title("Average Thinking Tokens by Task Type")
    plt.xlabel("Task Type")
    plt.ylabel("Average Thinking Tokens")
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "thinking_tokens_by_task.png"))
    
    # 3. Plot usage vs budget
    plt.figure(figsize=(10, 6))
    plt.scatter(df["thinking_budget"], df["thinking_tokens"], alpha=0.5)
    plt.plot([0, df["thinking_budget"].max()], [0, df["thinking_budget"].max()], 
             linestyle="--", color="gray", label="1:1 Line")
    plt.title("Thinking Budget vs Actual Token Usage")
    plt.xlabel("Budget (tokens)")
    plt.ylabel("Actual Usage (tokens)")
    plt.legend()
    plt.savefig(os.path.join(output_dir, "budget_vs_usage.png"))
    
    # 4. Box plot of token usage by task type
    plt.figure(figsize=(12, 8))
    box_data = [group["thinking_tokens"].values for name, group in df.groupby("task_type")]
    plt.boxplot(box_data, labels=df["task_type"].unique())
    plt.title("Thinking Token Usage Distribution by Task Type")
    plt.xlabel("Task Type")
    plt.ylabel("Thinking Tokens")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "token_boxplot_by_task.png"))
    
    # 5. Efficiency plot
    plt.figure(figsize=(10, 6))
    efficiency = df["thinking_tokens"] / df["thinking_budget"] * 100
    plt.hist(efficiency, bins=20, alpha=0.7, color="orange")
    plt.title("Budget Utilization Efficiency")
    plt.xlabel("Percentage of Budget Used")
    plt.ylabel("Frequency")
    plt.savefig(os.path.join(output_dir, "budget_efficiency.png"))

def generate_optimization_report(analysis: Dict, output_file: str) -> None:
    """Generate a text report with optimization recommendations."""
    with open(output_file, "w") as f:
        f.write("# Extended Thinking Budget Optimization Report\n\n")
        
        f.write("## Overall Statistics\n\n")
        f.write(f"- Total records analyzed: {analysis['overall']['count']}\n")
        f.write(f"- Average thinking tokens used: {analysis['overall']['avg_tokens']:.1f}\n")
        f.write(f"- Median thinking tokens used: {analysis['overall']['median_tokens']:.1f}\n")
        f.write(f"- Maximum thinking tokens used: {analysis['overall']['max_tokens']}\n")
        f.write(f"- Average budget utilization: {analysis['overall']['avg_percentage']:.1f}%\n\n")
        
        f.write("## Optimization Recommendations by Task Type\n\n")
        for task_type, stats in analysis["by_task_type"].items():
            f.write(f"### {task_type.capitalize()}\n\n")
            f.write(f"- Records analyzed: {stats['count']}\n")
            f.write(f"- Current average token usage: {stats['avg_tokens']:.1f}\n")
            f.write(f"- 95th percentile token usage: {stats['p95_tokens']:.1f}\n")
            f.write(f"- Recommended budget: {stats['suggested_budget']}\n")
            
            potential_savings = stats['potential_savings']
            if potential_savings > 0:
                savings_per_request = stats['potential_savings']
                total_savings = savings_per_request * stats['count']
                cost_savings = total_savings * (15.0 / 1000000)  # At $15 per million output tokens
                
                f.write(f"- Potential token savings per request: {savings_per_request:.1f}\n")
                f.write(f"- Projected annual savings (at current volume): ${cost_savings * 365:.2f}\n")
            else:
                f.write("- Current budget setting appears appropriate\n")
            
            f.write("\n")
        
        f.write("## Proposed Configuration\n\n")
        f.write("```yaml\nextended_thinking:\n  settings:\n    scaling_settings:\n")
        for task_type, stats in analysis["by_task_type"].items():
            config_key = f"      {task_type}_tasks"
            f.write(f"{config_key}: {stats['suggested_budget']}  # Based on {stats['count']} records\n")
        f.write("```\n")

def main():
    parser = argparse.ArgumentParser(description="Analyze extended thinking token usage")
    parser.add_argument("--log-dir", help="Directory containing log files")
    parser.add_argument("--output-dir", default="thinking_analysis", 
                        help="Directory for output files")
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    print("Loading thinking token data from logs...")
    df = load_thinking_data_from_logs(args.log_dir)
    
    if df.empty:
        print("No extended thinking data found in logs")
        return
    
    print(f"Analyzing {len(df)} thinking records...")
    analysis = analyze_thinking_efficiency(df)
    
    print("Generating visualizations...")
    generate_visualizations(df, args.output_dir)
    
    print("Generating optimization report...")
    report_path = os.path.join(args.output_dir, "optimization_report.md")
    generate_optimization_report(analysis, report_path)
    
    # Save the raw data for further analysis if needed
    df.to_csv(os.path.join(args.output_dir, "thinking_data.csv"), index=False)
    
    print(f"Analysis complete. Results saved to {args.output_dir}")
    print(f"Optimization report: {report_path}")

if __name__ == "__main__":
    main()