"""mce-profile MCP server（stdio）。

最小暴露面（spec: profile-mcp）：只读画像产物 + 校准写入；不提供原文批量导出。
环境变量：MCE_API_URL / MCE_EMAIL / MCE_PASSWORD。
"""

import os

from mcp.server.fastmcp import FastMCP

from mcp_server.api_client import ApiClient
from mcp_server.formatters import format_brief, format_claims, format_dream, format_evidence

mcp = FastMCP("mce-profile")

_api: ApiClient | None = None


def _api_override(client) -> None:
    """测试注入。"""
    global _api
    _api = client


def _get_api() -> ApiClient:
    global _api
    if _api is None:
        _api = ApiClient(
            base_url=os.environ.get("MCE_API_URL", "http://localhost:8008"),
            email=os.environ["MCE_EMAIL"],
            password=os.environ["MCE_PASSWORD"],
        )
    return _api


@mcp.tool()
def get_user_brief() -> str:
    """获取用户简报：用户是谁、在做什么项目、工作/语言/解题习惯。新会话开始时调用。"""
    return format_brief(_get_api().request("GET", "/v1/profile/brief"))


@mcp.tool()
def search_profile(query: str, dimension: str | None = None, project: str | None = None) -> str:
    """按话题语义检索用户画像断言。dimension 可选：basic_info|project_context|working_style|
    language_style|problem_solving|skill_signal|ai_usage。"""
    params: dict = {"q": query}
    if dimension:
        params["dimension"] = dimension
    if project:
        params["project"] = project
    return format_claims(_get_api().request("GET", "/v1/profile/claims", params=params))


@mcp.tool()
def get_claim_evidence(claim_id: str) -> str:
    """查看某条画像断言的证据链（来源会话、消息区间、引文）。"""
    return format_evidence(_get_api().request("GET", f"/v1/profile/claims/{claim_id}/evidence"))


@mcp.tool()
def correct_profile(claim_id: str, action: str, corrected_text: str | None = None) -> str:
    """校准画像断言。action：confirm 确认｜reject 否定（永久废弃不复活）｜correct 修正（需 corrected_text）。"""
    body = {"claim_id": claim_id, "action": action}
    if corrected_text:
        body["corrected_text"] = corrected_text
    out = _get_api().request("POST", "/v1/profile/calibrations", json=body)
    return f"已校准：claim {out['id']} → {out['status']}（置信 {out['confidence']:.2f}）"


@mcp.tool()
def get_profile_suggestions() -> str:
    """获取系统基于 AI 使用模式给用户的使用/改进建议。"""
    return format_claims(_get_api().request("GET", "/v1/profile/claims",
                                            params={"dimension": "ai_usage"}))


@mcp.tool()
def get_dream_report(date: str | None = None) -> str:
    """查看最近一次"做梦"（每日画像融合）的变化说明：哪些断言被新增/加强/削弱/废弃。"""
    return format_dream(_get_api().request("GET", "/v1/profile/dreams/latest"))


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
