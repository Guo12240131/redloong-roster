-- ============================================================
-- schema.sql — 红龙骑士团名册 · 云数据库结构
-- ------------------------------------------------------------
-- 用途：给「自己的云项目」建出这套表 + 行级安全策略（RLS）。
--      没有这一步，页面能打开，但云同步会一直是关着的。
--
-- 怎么用：
--   1. 在云服务后台的 SQL 控制台里执行本文件
--   2. 如果你的平台限制「一次只能提交一条语句」，就按分号逐段执行
--   3. 执行完把 endpoint / publishableKey 填进 assets/cloud.config.js
--
-- 设计要点（先看这三条，能省掉一半困惑）：
--   · 云端是真源，浏览器 localStorage 只是缓存
--   · owner_id 默认 auth.uid()，所以插入时不用自己传，数据库会填当前登录者
--   · 权限真正卡在 RLS 上，前端藏按钮只是观感，改不了「能不能写」
--
-- 五张表各管什么：
--   gallery_roster     公会信息 + 廷结构的整包快照（管理者视角的家底）
--   gallery_members    一行一名成员，owner_id 即投稿人
--   gallery_published  上线名单；只有管理员能增删 —— 投稿人改不了自己的上线状态
--   gallery_admins     管理员 uid 白名单；表为空时第一位登录者自动激活
--   gallery_decisions  审核留痕（通过/驳回 + 回话），投稿人只看得到自己的
-- ============================================================


-- ------------------------------------------------------------
-- 1. 建表
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gallery_roster (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id   text        NOT NULL DEFAULT auth.uid(),
  doc_key    text        NOT NULL DEFAULT 'main',
  payload    jsonb       NOT NULL,
  rev        bigint      NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_members (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id   text        NOT NULL DEFAULT auth.uid(),
  member_key text        NOT NULL,
  payload    jsonb       NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_published (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_key   text        NOT NULL,
  published_by text        NOT NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_admins (
  uid        text        PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_decisions (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    text        NOT NULL DEFAULT auth.uid(),   -- 被审的那份投稿的归属人
  member_key  text        NOT NULL,
  member_name text,
  decision    text        NOT NULL,                       -- 'approved' | 'rejected'
  note        text,                                       -- 给投稿人的回话
  reviewer_id text        NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- 2. 唯一索引
--    同步层靠「撞唯一键就改成 update」来做幂等，所以这几个唯一索引
--    不是优化项，是功能项，别省。
--    （PostgreSQL 没有 CREATE INDEX IF NOT EXISTS 之前的老版本要注意，
--      报「已存在」跳过即可）
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS gallery_roster_doc_key_uidx    ON gallery_roster (doc_key);
CREATE UNIQUE INDEX IF NOT EXISTS gallery_members_key_uidx       ON gallery_members (member_key);
CREATE UNIQUE INDEX IF NOT EXISTS gallery_published_key_uidx     ON gallery_published (member_key);


-- ------------------------------------------------------------
-- 3. 表级授权
--    RLS 是「行级」的门，GRANT 是「表级」的门 —— 两道都要开。
--    只配 RLS 不 GRANT 会得到形似「策略失效」的 42501 权限错误，很难查。
-- ------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_roster    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_members   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_published TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_admins    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_decisions TO anon, authenticated;


-- ------------------------------------------------------------
-- 4. 打开行级安全
-- ------------------------------------------------------------

ALTER TABLE gallery_roster    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_published ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_admins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_decisions ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 5. 策略
--    PostgreSQL 没有 CREATE POLICY IF NOT EXISTS，所以先 DROP 再 CREATE，
--    这样本文件可以反复执行。
--
--    下面反复出现的这段子查询就是「判断当前登录者是不是管理员」：
--      EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid())
--    抽成一个函数会更干净，但保持内联可以让策略彼此独立、便于按表调整。
-- ------------------------------------------------------------

-- 名册整包：谁都能读（访客要看公会信息）；只有管理者能写
DROP POLICY IF EXISTS gallery_roster_read_all ON gallery_roster;
CREATE POLICY gallery_roster_read_all   ON gallery_roster FOR SELECT USING (true);

DROP POLICY IF EXISTS gallery_roster_insert ON gallery_roster;
CREATE POLICY gallery_roster_insert     ON gallery_roster FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));

DROP POLICY IF EXISTS gallery_roster_update ON gallery_roster;
CREATE POLICY gallery_roster_update     ON gallery_roster FOR UPDATE
  USING      ((owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()))
  WITH CHECK ((owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));

DROP POLICY IF EXISTS gallery_roster_delete ON gallery_roster;
CREATE POLICY gallery_roster_delete     ON gallery_roster FOR DELETE
  USING (EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));


-- 成员表：读 = 已上线 / 自己投稿的 / 管理者；写 = 自己的行，管理者全权
DROP POLICY IF EXISTS gallery_members_read ON gallery_members;
CREATE POLICY gallery_members_read      ON gallery_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM gallery_published p WHERE p.member_key = gallery_members.member_key)
    OR owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid())
  );

DROP POLICY IF EXISTS gallery_members_insert ON gallery_members;
CREATE POLICY gallery_members_insert    ON gallery_members FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS gallery_members_update ON gallery_members;
CREATE POLICY gallery_members_update    ON gallery_members FOR UPDATE
  USING      ((owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()))
  WITH CHECK ((owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));

DROP POLICY IF EXISTS gallery_members_delete ON gallery_members;
CREATE POLICY gallery_members_delete    ON gallery_members FOR DELETE
  USING ((owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));


-- 上线名单：谁都能读（访客据此看到已上线的成员）；只有管理者能增删
DROP POLICY IF EXISTS gallery_published_read ON gallery_published;
CREATE POLICY gallery_published_read    ON gallery_published FOR SELECT USING (true);

DROP POLICY IF EXISTS gallery_published_insert ON gallery_published;
CREATE POLICY gallery_published_insert  ON gallery_published FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));

DROP POLICY IF EXISTS gallery_published_delete ON gallery_published;
CREATE POLICY gallery_published_delete  ON gallery_published FOR DELETE
  USING (EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));


-- 管理员白名单：可读（前端要判断自己是不是管理员）；
-- 只允许「表还空着时插入自己」这一条写策略 —— 即首位登录者自助激活。
-- 之后要加人，直接往表里插 uid，别从应用里做。
DROP POLICY IF EXISTS gallery_admins_read ON gallery_admins;
CREATE POLICY gallery_admins_read       ON gallery_admins FOR SELECT USING (true);

DROP POLICY IF EXISTS gallery_admins_claim_first ON gallery_admins;
CREATE POLICY gallery_admins_claim_first ON gallery_admins FOR INSERT
  WITH CHECK (
    uid = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM gallery_admins)
  );


-- 审核留痕：投稿人看自己的回执，管理者看全部；只有管理者能写
DROP POLICY IF EXISTS gallery_decisions_read ON gallery_decisions;
CREATE POLICY gallery_decisions_read    ON gallery_decisions FOR SELECT
  USING ((owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid()));

DROP POLICY IF EXISTS gallery_decisions_insert ON gallery_decisions;
CREATE POLICY gallery_decisions_insert  ON gallery_decisions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM gallery_admins a WHERE a.uid = auth.uid())
    AND reviewer_id = auth.uid()
  );


-- ------------------------------------------------------------
-- 6. 自检：跑完这段，五张表各应返回一行、策略数应为 15
-- ------------------------------------------------------------
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'gallery\_%' ORDER BY 1;
-- SELECT count(*) AS policy_count FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'gallery\_%';
