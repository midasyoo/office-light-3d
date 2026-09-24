# -*- coding: utf-8 -*-
"""
index.html + 스크립트들을 단일 HTML 파일로 묶는다.

three.js, 좌석/조명 데이터, 얼굴 텍스처까지 모두 안에 넣으므로
만들어진 파일 하나만 복사해도 어디서든 실행된다.

  python tools/build_standalone.py [출력파일]
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_OUT = '사무실-3D-조명제어.html'

NOTE = """<!--
  사무실 파티션 좌석 조명 제어 3D (단일 파일)
  이 파일 하나만 있으면 브라우저에서 바로 실행됩니다. 인터넷 연결도 필요 없습니다.
  실제 조명 제어는 사내망에서만 동작하며, 사외에서는 시뮬레이션 모드로 보입니다.
  원본 프로젝트에서 다시 만들기: python tools/build_standalone.py
-->
"""


def main():
    out_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

    # 설치형(PWA) 전용 마크업 제거.
    # 단일 파일은 file:// 로 열리므로 매니페스트·서비스워커·모바일 화면 전환이
    # 동작하지 않는다. 특히 mobile.html 로 보내는 전환 코드가 남아 있으면
    # 휴대폰에서 이 파일을 열었을 때 빈 화면이 된다.
    # 여는 표시 뒤에 설명을 덧붙여도 걸리도록 --> 까지 통째로 흘려 보낸다.
    src, n_pwa = re.subn(r'[ \t]*<!--\s*PWA:BEGIN.*?-->.*?<!--\s*PWA:END\s*-->[ \t]*\n?',
                         '', src, flags=re.S)

    # 외부에서 받아오는 스크립트(방문 집계 등)는 넣지 않는다.
    # 오프라인 실행이 목적이고, 파일 하나를 열었을 뿐인데 바깥으로
    # 요청이 나가서도 안 된다.
    src, n_ext = re.subn(r'[ \t]*<script[^>]*\ssrc="https?://[^"]*"[^>]*>\s*</script>[ \t]*\n?',
                         '', src)
    src = re.sub(r'[ \t]*<!--\s*방문 집계:[^>]*-->[ \t]*\n?', '', src)

    used = []

    def inline(m):
        path = m.group(1)
        full = os.path.join(ROOT, path.replace('/', os.sep))
        if not os.path.exists(full):
            raise SystemExit('파일 없음: %s' % path)
        code = open(full, encoding='utf-8').read()
        # 문자열 안에 </script 가 있으면 파서가 스크립트를 일찍 닫는다
        code = code.replace('</script', '<\\/script')
        used.append((path, len(code)))
        return '<script>\n/* ===== %s ===== */\n%s\n</script>' % (path, code)

    html = re.sub(r'<script src="([^"]+)"></script>', inline, src)

    if '<script src=' in html:
        raise SystemExit('인라인되지 않은 script 태그가 남아 있습니다')

    html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + NOTE, 1)

    out = os.path.join(ROOT, out_name)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

    for path, n in used:
        print('  %-22s %7.1f KB' % (path, n / 1024))
    if n_pwa or n_ext:
        print('  제외: 설치형 전용 %d블록 · 외부 스크립트 %d개' % (n_pwa, n_ext))
    print('\n%s (%.1f MB)' % (out_name, os.path.getsize(out) / 1024 / 1024))


if __name__ == '__main__':
    main()
