# 重排序（Rerank）：把 TopK 做到更可靠

## Rerank 在解决什么
召回阶段宁可多捞一点，但 TopK 里噪声会很大。

Rerank 用更强的匹配器把相关段落排到前面。

## 1) 常见 rerank 方案
- cross-encoder：准确但慢
- LLM rerank：灵活但成本高

## 2) 工程策略
- 召回 TopK 先大一点（如 50）
- rerank 到 TopN（如 5~10）
- 最终上下文拼接要控制长度

## 3) 避免引入幻觉
rerank 不能“编造理由”，它只负责排序。

## 自检清单
- 你知道 rerank 的成本主要在哪里吗？

