-- ================================================
-- AI Curhat App - Supabase SQL Schema + Study Notes, Tasks & Custom Subjects
-- Jalankan di: https://supabase.com/dashboard/project/phyaabrmqwlxlmexegpf/sql/new
-- ================================================

-- 1. PROFILES TABLE (DENGAN ROLE-BASED ACCESS CONTROL: 'student' ATAU 'admin')
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- TIPS: Cara mengangkat akun menjadi Admin lewat SQL:
-- UPDATE public.profiles SET role = 'admin' WHERE username = 'nama_username_kamu';

-- 2. CHAT SESSIONS & MESSAGES TABLE (MULTI-THREAD CHAT SESSIONS)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'Obrolan Baru',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages"   ON public.chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);

-- 3. JOURNAL ENTRIES TABLE
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  mood TEXT DEFAULT 'neutral',
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own entries"   ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);

-- 4. STUDENT CUSTOM SUBJECTS TABLE (DAFTAR MATA KULIAH MAHASISWA)
CREATE TABLE IF NOT EXISTS public.student_subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own subjects" ON public.student_subjects;
CREATE POLICY "Users can manage own subjects" ON public.student_subjects FOR ALL USING (auth.uid() = user_id);

-- 5. STUDY NOTES TABLE (CATATAN KULIAH + RANGKUMAN & KUIS AI)
CREATE TABLE IF NOT EXISTS public.study_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  quiz_data JSONB DEFAULT '[]',
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own study notes" ON public.study_notes;
CREATE POLICY "Users can manage own study notes" ON public.study_notes FOR ALL USING (auth.uid() = user_id);

-- 6. STUDENT TASKS TABLE (MANAJEMEN TUGAS & DEADLINE KULIAH)
CREATE TABLE IF NOT EXISTS public.student_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  due_date TEXT,
  priority TEXT DEFAULT 'medium',
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.student_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own tasks" ON public.student_tasks;
CREATE POLICY "Users can manage own tasks" ON public.student_tasks FOR ALL USING (auth.uid() = user_id);

-- 7. DYNAMIC APP MOODS TABLE (ADMIN)
CREATE TABLE IF NOT EXISTS public.app_moods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_key TEXT UNIQUE NOT NULL,
  emoji TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_moods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view moods" ON public.app_moods FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage moods" ON public.app_moods FOR ALL USING (true);

-- 8. APP SETTINGS TABLE (AI PERSONA & CONFIGS)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage settings" ON public.app_settings FOR ALL USING (true);

-- 9. USER THEME SETTINGS TABLE (CUSTOM LIGHT / DARK / CUSTOM COLOR PALETTE)
CREATE TABLE IF NOT EXISTS public.user_theme_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  theme_mode TEXT DEFAULT 'dark',
  theme_id TEXT DEFAULT 'obsidian-blue',
  primary_color TEXT DEFAULT '#2563EB',
  accent_color TEXT DEFAULT '#3B82F6',
  background_color TEXT DEFAULT '#0E1117',
  card_color TEXT DEFAULT '#141822',
  text_color TEXT DEFAULT '#F3F4F6',
  border_color TEXT DEFAULT '#1E2430',
  custom_theme JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_theme_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own theme" ON public.user_theme_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own theme" ON public.user_theme_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own theme" ON public.user_theme_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 10. AUTO-CREATE PROFILE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. ENABLE REALTIME FOR ALL TABLES
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_subjects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_moods;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_theme_settings;
