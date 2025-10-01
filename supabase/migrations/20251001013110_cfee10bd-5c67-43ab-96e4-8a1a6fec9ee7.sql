-- Create chess_lobbies table
CREATE TABLE public.chess_lobbies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_name TEXT NOT NULL,
  time_control TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 5,
  increment INTEGER NOT NULL DEFAULT 0,
  elo_level TEXT,
  coaching_mode BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open',
  opponent_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chess_lobbies ENABLE ROW LEVEL SECURITY;

-- Create policies for public access to lobbies
CREATE POLICY "Anyone can view lobbies"
ON public.chess_lobbies
FOR SELECT
USING (true);

CREATE POLICY "Anyone can create lobbies"
ON public.chess_lobbies
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update lobbies"
ON public.chess_lobbies
FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete lobbies"
ON public.chess_lobbies
FOR DELETE
USING (true);

-- Create index for efficient queries
CREATE INDEX idx_chess_lobbies_status ON public.chess_lobbies(status);
CREATE INDEX idx_chess_lobbies_created_at ON public.chess_lobbies(created_at DESC);