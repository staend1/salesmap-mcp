import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // 업계 관례 경로 (mcp.linear.app/mcp, mcp.sentry.dev/mcp 와 동일 패턴).
      // 신규 안내: https://mcp.ai.salesmap.kr/mcp — 기존 /api/mcp 도 그대로 동작 (rewrite는 추가일 뿐).
      { source: "/mcp", destination: "/api/mcp" },
    ];
  },
};

export default nextConfig;
