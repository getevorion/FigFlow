/**
 * The generated project's C++ layout, applied with clang-format (the
 * WebAssembly build, so it runs the same everywhere) and shipped as the
 * project's .clang-format: Allman braces except on namespaces, 4-space
 * indents, 120 columns, spaces inside braced initializers.
 */
import { format } from "@wasm-fmt/clang-format";

export const CLANG_FORMAT = `---
BasedOnStyle: Microsoft
ColumnLimit: 120
IndentWidth: 4
TabWidth: 4
UseTab: Never
PointerAlignment: Left
ReferenceAlignment: Left
BreakBeforeBraces: Custom
BraceWrapping:
  AfterCaseLabel: true
  AfterClass: true
  AfterControlStatement: Always
  AfterEnum: true
  AfterFunction: true
  AfterNamespace: false
  AfterStruct: true
  AfterUnion: true
  BeforeCatch: true
  BeforeElse: true
  BeforeLambdaBody: false
  BeforeWhile: false
  IndentBraces: false
  SplitEmptyFunction: false
  SplitEmptyRecord: false
  SplitEmptyNamespace: false
AllowShortFunctionsOnASingleLine: Empty
AllowShortIfStatementsOnASingleLine: Never
AllowShortLoopsOnASingleLine: false
AllowShortBlocksOnASingleLine: Never
AllowShortEnumsOnASingleLine: false
Cpp11BracedListStyle: false
FixNamespaceComments: false
NamespaceIndentation: None
IndentCaseLabels: false
SortIncludes: Never
IncludeBlocks: Preserve
ReflowComments: false
AlignTrailingComments: false
AlignConsecutiveAssignments: None
AlignConsecutiveDeclarations: None
BinPackArguments: true
BinPackParameters: true
SeparateDefinitionBlocks: Always
MaxEmptyLinesToKeep: 1
KeepEmptyLines:
  AtEndOfFile: false
  AtStartOfBlock: false
  AtStartOfFile: false
...
`;

/** C++ source laid out in the project's style. */
export function formatCpp(source: string, path: string): string {
  return format(source, path, CLANG_FORMAT);
}
