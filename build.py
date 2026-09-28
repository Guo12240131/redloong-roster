# -*- coding: utf-8 -*-
"""
build.py — 把画廊打包成「可直接转发」的单文件 HTML

做法：CSS / JS / 团徽图片全部内联进一个 .html，字体走国内镜像 + 本机 serif 兜底。
对方拿到后双击即开，无需服务器、无需 assets 目录。

用法：
    python build.py
产物：
    dist/红龙骑士团-名册.html      单文件（自包含，约 0.4 MB）
    dist/红龙骑士团-名册.zip       传播包（含单文件 + 可编辑源码版）
"""
import base64
import io
import mimetypes
import os
import re
import zipfile
from datetime import date

BASE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(BASE, 'dist')
CREST_SRC = 'assets/img/guild_crest.png'
CREST_INLINE_W = 560          # 内联版宽度（页面实际显示 168px，Retina 2x 足够）
OUTPUT_NAME = '红龙骑士团-名册'

MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}


def read(rel):
    with io.open(os.path.join(BASE, rel), encoding='utf-8') as f:
        return f.read()


def build_inline_crest(width):
    """生成适合内联的轻量团徽（保留高清原图给源码版）"""
    from PIL import Image
    src = Image.open(os.path.join(BASE, CREST_SRC)).convert('RGBA')
    w = min(width, src.width)
    small = src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, 'PNG', optimize=True)
    data = buf.getvalue()
    return base64.b64encode(data).decode('ascii')


def inline_local_images(text):
    """把 assets/ 与 portraits/ 下的本地图片路径替换成 data URI（找不到则保留原路径）"""
    def repl(m):
        quote, path = m.group(1), m.group(2)
        full = os.path.join(BASE, path.replace('/', os.sep))
        ext = os.path.splitext(path)[1].lower()
        if not (os.path.exists(full) and ext in MIME):
            return m.group(0)
        with open(full, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('ascii')
        return "%sdata:%s;base64,%s%s" % (quote, MIME[ext], b64, quote)
    return re.sub(r'([\'"])((?:assets|portraits)/[^\'"]+\.(?:png|jpe?g|webp))\1', repl, text)


def build_single_html():
    html = read('index.html')

    # 1) 内联样式
    css = read('assets/style.css')
    html = html.replace('<link rel="stylesheet" href="assets/style.css">',
                        '<style>\n' + css + '\n</style>')

    # 2) 内联脚本（按加载顺序）
    #    云配置单独处理：文件存在就内联（打包出的单文件才能联网同步），
    #    不存在就把标签整行换成注释 —— 否则单文件打开时会去请求一个不存在的
    #    assets/cloud.config.js，虽然无害但控制台会留一条 404。
    cfg_tag = '<script src="assets/cloud.config.js"></script>'
    if cfg_tag in html:
        if os.path.exists(os.path.join(BASE, 'assets/cloud.config.js')):
            html = html.replace(cfg_tag, '<script>\n' + read('assets/cloud.config.js') + '\n</script>')
        else:
            html = html.replace(cfg_tag,
                '<!-- 未提供 cloud.config.js：本包以「离线单机版」运行，编辑只存本机 -->')

    scripts = ['assets/vendor/workbuddy-cloud-sdk.global.js',
               'assets/heraldry.js', 'assets/data.js', 'assets/sync.js',
               'assets/review.js', 'assets/editor.js', 'assets/app.js']
    for rel in scripts:
        tag = '<script src="%s"></script>' % rel
        if tag not in html:
            raise SystemExit('未找到脚本标签：' + tag)
        html = html.replace(tag, '<script>\n' + read(rel) + '\n</script>')

    # 3) 团徽：整份文本里所有该路径引用统一换成内联轻量版
    #    （注意 data.js 的默认值与 app.js 的旧数据迁移都会引用它，必须全部命中）
    html = html.replace('assets/img/guild_crest.png',
                        'data:image/png;base64,%s' % build_inline_crest(CREST_INLINE_W))
    #    其余本地图片（如 portraits/ 下的成员肖像）一并内联
    html = inline_local_images(html)

    # 4) 字体换国内镜像（转发给国内用户更快），失败也有本机 serif 兜底
    html = html.replace('https://fonts.googleapis.com/css2', 'https://fonts.font.im/css2')
    html = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', html)

    # 5) 社交传播信息
    og = ('\n    <meta property="og:title" content="红龙骑士团 · 名册">'
          '\n    <meta property="og:description" content="骑士议事厅 · 骑士团 · 友军骑士团 —— 誓言与铁同等重">'
          '\n    <meta property="og:type" content="website">'
          '\n    <meta name="theme-color" content="#0a0908">')
    html = html.replace('<meta name="description"', og.strip() + '\n    <meta name="description"', 1)

    # 6) 标注构建信息
    html = html.replace('<!-- ① 单文件版 -->', '')
    stamp = '<!-- 红龙骑士团 · 单文件版 · 构建于 %s · 内含所有样式与素材，可直接转发 -->' % date.today()
    html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + stamp, 1)

    return html


def build_zip(single_path):
    """传播包：单文件 + 可编辑源码版"""
    zip_path = os.path.join(DIST, OUTPUT_NAME + '.zip')
    sources = ['index.html', 'assets/style.css', 'assets/heraldry.js', 'assets/data.js',
               'assets/sync.js', 'assets/review.js', 'assets/editor.js', 'assets/app.js',
               'assets/cloud.config.example.js',
               'assets/vendor/workbuddy-cloud-sdk.global.js', 'assets/img/guild_crest.png',
               'portraits/放图说明.txt']
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(single_path, os.path.basename(single_path))
        z.writestr('可编辑源码/README.txt', read('dist/README-source.txt'))
        for rel in sources:
            full = os.path.join(BASE, rel)
            if os.path.exists(full):
                z.write(full, '可编辑源码/' + rel)
    return zip_path


def write_readme():
    text = """可编辑源码版 —— 使用说明
================================================================

目录里的 index.html 是「带素材目录」的原始工程版，
用于你想继续改结构、改默认数据时用；分享给别人请用根目录的
单文件 HTML（双击即开，不需要 assets 目录）。

【文件职责】
  assets/style.css      视觉系统（配色/石墙/炉火/卡片层级差异都在这里改）
  assets/heraldry.js    纹章生成器（盾形、鸢尾、冠冕、色记、五个层级）
  assets/data.js        默认名册数据（公会信息 + 三廷 + 成员）
  assets/sync.js        云端同步（拉云端 / 改动自动上传 / 登录 / 角色判定）
  assets/review.js      登录面板 · 管理者审核队列 · 我的投稿与回执
  assets/editor.js      锻造模式的增删改逻辑
  assets/app.js         渲染、详情页、粒子、隐蔽入口
  assets/cloud.config.js        云端配置（自己填，不入版本库，见 .example.js）
  assets/cloud.config.example.js 上面那份的模板
  assets/vendor/        云服务 SDK（打包时内联，单文件也能联网同步）
  assets/img/           高清团徽
  portraits/            放成员肖像（见目录内说明）

【开启云同步】
  复制 assets/cloud.config.example.js 为 assets/cloud.config.js，填上自己
  云项目的 endpoint 与 publishableKey，刷新即可登录。不填则页面以离线单机版运行。

【两套用法】
  ① 在线版（推荐）：部署成网址后，云端那份名册是唯一真源 ——
     访客打开就读最新数据；你在锻造模式里登录一次，之后每次保存自动上传，
     手机 / 电脑 / 别人转发的链接看到的都是同一份，不用再重新打包。
  ② 单机版：直接双击单文件 HTML 也能用，但此时同步层会自己关掉，
     编辑结果只保存在这台浏览器里，需要带走就用锻造模式的「导出」再「导入」。

【改完后重新打包】
    python build.py
  会在 dist/ 生成新的单文件与传播 zip。

【三种身份】
  访客（不登录）：只看已上线的成员。
  投稿人（登录）：可以递交新成员 —— 先躺进管理者的审核队列，不对外显示；
                  已经过审上线的那部分，本人随时改、随时生效，不用再审。
  管理者（登录）：全部编辑权 + 「审核队列」里通过 / 驳回（可附回话给投稿人）。
  管理员白名单空着时，第一个登录的账号自动成为管理者（之后要加人，
  在 gallery_admins 表里插一条 uid 即可）。

【注意】
  · 浏览器本地 localStorage 只是缓存，云同步在线时才生效。
  · 权限真正卡在数据库的行级安全策略上，界面隐藏按钮只是观感，改不了可实现性。
  · 肖像上传会自动居中裁 1:1 并压到 512px，别塞 2560×1600 的原图进名册。
"""
    p = os.path.join(DIST, 'README-source.txt')
    with io.open(p, 'w', encoding='utf-8') as f:
        f.write(text)


def main():
    if not os.path.isdir(DIST):
        os.makedirs(DIST)

    html = build_single_html()
    out = os.path.join(DIST, OUTPUT_NAME + '.html')
    with io.open(out, 'w', encoding='utf-8') as f:
        f.write(html)

    write_readme()
    zpath = build_zip(out)

    kb = lambda p: round(os.path.getsize(p) / 1024, 1)
    print('构建完成')
    print('  单文件：', os.path.basename(out), kb(out), 'KB')
    print('  传播包：', os.path.basename(zpath), kb(zpath), 'KB')
    # 任何残存的本地路径引用都会让单文件在别人电脑上开天窗
    # 输入框里的示例占位文案不是真实引用，放行
    leftover = set()
    for i, line in enumerate(html.splitlines()):
        if 'placeholder' in line:
            continue
        leftover.update(re.findall(r'[\'"](?:assets|portraits)/[^\'"]+[\'"]', line))
    if leftover:
        print('  ⚠ 仍有未内联的本地引用：', leftover)
    else:
        print('  ✓ 无外部素材依赖（除字体 CDN，已配本机 serif 兜底）')


if __name__ == '__main__':
    main()
