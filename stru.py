import os
import textwrap

def get_included_files(root, exclude_dirs, include_exts, skip_files=None):
    """Collect paths of files to include based on extensions and exclusions."""
    included_files = []
    skip_files = skip_files or set()
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        # Exclude specified directories
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for filename in filenames:
            # Skip specified files and lock files
            if filename in skip_files or "package-lock.json" in filename:
                continue
            
            # Check if the file extension should be included
            ext = os.path.splitext(filename)[1]
            if ext in include_exts or not ext: # Include files with no extension
                filepath = os.path.join(dirpath, filename)
                included_files.append(filepath)
    return included_files

def get_directory_tree(root, exclude_dirs, include_exts, skip_files=None):
    """Generate directory structure as a string with indentation."""
    output = ["PROFESIONAL Project Directory Structure:"]
    skip_files = skip_files or set()
    
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        
        # Calculate depth and indent
        relative_path = os.path.relpath(dirpath, root)
        depth = relative_path.count(os.sep) if relative_path != '.' else -1
        indent = "    " * (depth + 1)

        # Add directory to output
        if relative_path != '.':
             output.append(f"{indent}{os.path.basename(dirpath)}/")
        else:
             output.append(f"{os.path.basename(root)}/")


        # Add files to output
        sub_indent = indent + "    "
        included_filenames = [
            f for f in filenames
            if f not in skip_files and (os.path.splitext(f)[1] in include_exts or not os.path.splitext(f)[1])
            and "package-lock.json" not in f
        ]
        for filename in sorted(included_filenames):
            output.append(f"{sub_indent}{filename}")
            
    return "\n".join(output)

def ensure_gitignore_has_entry(filename: str):
    """Ensure the given filename is ignored in .gitignore."""
    gitignore_path = ".gitignore"
    try:
        if os.path.exists(gitignore_path):
            with open(gitignore_path, "r+", encoding="utf-8") as f:
                lines = f.read().splitlines()
                if filename not in lines:
                    f.write(f"\n# Ignore generated context file\n{filename}\n")
                    print(f"✅ Added '{filename}' to .gitignore.")
                else:
                    print(f"ℹ️  '{filename}' is already in .gitignore.")
        else:
            with open(gitignore_path, "w", encoding="utf-8") as f:
                f.write(f"# Ignore generated context file\n{filename}\n")
                print("✅ Created .gitignore and added the context file to it.")
    except Exception as e:
        print(f"⚠️ Failed to update .gitignore: {e}")

def generate_project_file():
    """Generate a text file with project structure and file contents."""
    # This script should be run from the root of the monorepo (e.g., inside 'profesional-app')
    project_dir = "."
    output_file = "project_context.txt"
    # Skip the script itself and the output file
    skip_files = {output_file, os.path.basename(__file__)}

    exclude_dirs = [
        "node_modules", ".next", "dist", "build", ".git", ".vscode", ".idea",
        "out", ".cache", ".storybook", "stories", "coverage", ".vercel", "venv", "doc",
        "cache", "release", "dist", "blockjr-app"
        "__pycache__" # Exclude python cache directories
    ]

    include_exts = [
        # Frontend
        ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".scss", ".json",
        # Backend & Core
        ".py", ".toml",
        # Config & Docs
        ".md", ".txt", ".yml", ".yaml", ".xml", ".env", ".java", ".pro"
    ]

    print(f"🔍 Scanning project in '{os.path.abspath(project_dir)}'...")
    
    with open(output_file, "w", encoding="utf-8") as f:
        # Write the directory tree first
        tree = get_directory_tree(project_dir, exclude_dirs, include_exts, skip_files)
        f.write(tree)
        f.write("\n\n\n--- FILE CONTENTS ---\n")

        # Then write the contents of each included file
        included_files = get_included_files(project_dir, exclude_dirs, include_exts, skip_files)
        for filepath in sorted(included_files):
            relative_path = os.path.relpath(filepath, project_dir).replace(os.sep, '/')
            f.write(f"\n----- FILE: {relative_path} -----\n")
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as infile:
                    f.write(infile.read())
            except Exception as e:
                f.write(f"<!-- Error reading file: {e} -->")
            f.write("\n----- END FILE -----\n")

    print(f"\n✅ Workspace context successfully saved to '{output_file}'.")
    print("Please upload this file in our chat so I can review your changes.")
    ensure_gitignore_has_entry(output_file)

if __name__ == "__main__":
    generate_project_file()
