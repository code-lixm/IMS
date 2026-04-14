#!/usr/bin/env python3
"""
PDF 解析脚本 - 提取 PDF 文本内容
Usage: python3 parse_pdf.py <pdf_path> [--output <output_path>]
"""

import sys
import json
import argparse
from pathlib import Path

def extract_text_from_pdf(pdf_path):
    """从 PDF 文件提取文本"""
    try:
        import PyPDF2
        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            metadata = {
                'total_pages': len(pdf_reader.pages),
                'title': pdf_reader.metadata.title if pdf_reader.metadata else None,
                'author': pdf_reader.metadata.author if pdf_reader.metadata else None,
            }
            
            for page_num, page in enumerate(pdf_reader.pages, 1):
                page_text = page.extract_text()
                text += f"\n--- Page {page_num} ---\n{page_text}\n"
        
        return {
            'success': True,
            'metadata': metadata,
            'content': text.strip(),
            'word_count': len(text.split())
        }
    except ImportError:
        return {
            'success': False,
            'error': 'PyPDF2 not installed. Install with: pip install PyPDF2'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def extract_with_pdfplumber(pdf_path):
    """使用 pdfplumber 作为备选方案"""
    try:
        import pdfplumber
        text = ""
        metadata = {}
        
        with pdfplumber.open(pdf_path) as pdf:
            metadata['total_pages'] = len(pdf.pages)
            
            for i, page in enumerate(pdf.pages, 1):
                page_text = page.extract_text()
                if page_text:
                    text += f"\n--- Page {i} ---\n{page_text}\n"
        
        return {
            'success': True,
            'metadata': metadata,
            'content': text.strip(),
            'word_count': len(text.split())
        }
    except ImportError:
        return None
    except Exception as e:
        return {'success': False, 'error': str(e)}

def main():
    parser = argparse.ArgumentParser(description='Extract text from PDF file')
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('--output', '-o', help='Output file path (default: stdout)')
    parser.add_argument('--json', '-j', action='store_true', help='Output as JSON')
    
    args = parser.parse_args()
    
    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)
    
    # 尝试 PyPDF2
    result = extract_text_from_pdf(pdf_path)
    
    # 如果失败，尝试 pdfplumber
    if not result['success'] and 'not installed' not in result.get('error', ''):
        alt_result = extract_with_pdfplumber(pdf_path)
        if alt_result and alt_result.get('success'):
            result = alt_result
    
    # 输出结果
    if args.json:
        output = json.dumps(result, ensure_ascii=False, indent=2)
    else:
        if result['success']:
            meta = result['metadata']
            output = f"""PDF 解析结果
==============
文件名: {pdf_path.name}
页数: {meta.get('total_pages', 'N/A')}
字数: {result.get('word_count', 'N/A')}

内容:
{result['content']}
"""
        else:
            output = f"Error: {result['error']}"
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"Output saved to: {args.output}")
    else:
        print(output)

if __name__ == '__main__':
    main()
