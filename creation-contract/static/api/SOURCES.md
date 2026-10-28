# 协议实现参考

以下仅用于确认 JSON Schema 技术细节；拾页空间与实体语义为本资料的设计契约，不由这些文档背书。

- JSON Schema 官方 Structuring：https://json-schema.org/understanding-json-schema/structuring
- JSON Schema 官方对象附加属性：https://json-schema.org/understanding-json-schema/reference/object
- Ajv 官方 Draft 2020-12：https://ajv.js.org/json-schema.html#draft-2020-12-breaking

核对要点：共享定义使用 $defs/$ref；组合 Schema 时额外字段封闭规则必须正确；使用 Draft 2020-12 时选择相应 Ajv 类，不能仅修改 $schema 字符串。正式构建宜用 Ajv2020 进行一次真实编译与样例验证，并禁止静默类型强转/删除未知字段掩盖错误。
