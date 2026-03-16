use rustpython_parser::Mode;
use rustpython_ast::{self as ast, Visitor};

use swc_common::sync::Lrc;
use swc_common::{FileName, SourceMap};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax};
use swc_ecma_ast::ModuleDecl;

struct ImportVisitor {
    pub imports: Vec<String>,
}

impl Visitor for ImportVisitor {
    fn visit_stmt_import(&mut self, node: ast::StmtImport) {
        for alias in &node.names {
            self.imports.push(alias.name.to_string());
        }
    }
    fn visit_stmt_import_from(&mut self, node: ast::StmtImportFrom) {
        if let Some(module) = &node.module {
            self.imports.push(module.to_string());
        }
    }
}

pub fn check_py_imports(content: &str) -> Vec<String> {
    let mode = Mode::Module;
    let mut visitor = ImportVisitor { imports: vec![] };
    if let Ok(ast::Mod::Module(module)) = rustpython_parser::parse(content, mode, "test.py") {
        for stmt in module.body {
            visitor.visit_stmt(stmt);
        }
    }
    visitor.imports
}

pub fn check_js_imports(content: &str) -> Vec<String> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(Lrc::new(FileName::Custom("test.ts".into())), content.to_string());
    let lexer = Lexer::new(
        Syntax::Typescript(Default::default()),
        Default::default(),
        StringInput::from(&*fm),
        None,
    );
    let mut parser = Parser::new_from(lexer);
    let mut imports = vec![];
    if let Ok(module) = parser.parse_module() {
        for item in module.body {
            if let swc_ecma_ast::ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = item {
                if let Some(s) = import_decl.src.value.as_str() {
                    imports.push(s.to_string());
                }
            }
        }
    }
    imports
}

