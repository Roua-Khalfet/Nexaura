'use client'

import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { Send, Upload, Sparkles, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { sendChatMessage, uploadSourceFile } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sourceType?: string
  sources?: string[]
}

interface UploadedFile {
  name: string
  chunks: number
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

/* ── Animation variants ── */
const messageVariants = {
  initial: (role: string) => ({
    opacity: 0,
    scale: 0.85,
    y: 30,
    x: role === 'user' ? 40 : -40,
  }),
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
      mass: 0.8,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: 0.2 },
  },
}

const suggestionVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: 0.3 + i * 0.1,
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  }),
}

export default function ChatSection() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const hasPdf = uploadedFiles.some(f => f.status === 'ready')

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      // Le backend lit mode='notebook' pour déclencher has_pdf=True
      const result = await sendChatMessage({ 
        message: userMsg.content, 
        mode: hasPdf ? 'notebook' : 'kb', 
        knowledgeOnly: false // Obsolète mais gardé pour rétrocompatibilité api
      })
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant', content: result.response,
        timestamp: new Date(), sourceType: result.source_type, sources: result.sources,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: err instanceof Error ? err.message : 'Erreur inconnue.',
        timestamp: new Date(), sourceType: 'Erreur Système',
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (!files) return
    
    const fileList = Array.from(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
    
    for (const file of fileList) {
      const idx = uploadedFiles.length
      setUploadedFiles(prev => [...prev, { name: file.name, chunks: 0, status: 'uploading' }])
      try {
        const result = await uploadSourceFile(file)
        setUploadedFiles(prev => prev.map((f, i) => i === idx ? { ...f, chunks: result.chunks_indexed || 0, status: 'ready' } : f))
      } catch (err) {
        setUploadedFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Erreur' } : f))
      }
    }
  }

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    for (const file of files) {
      const idx = uploadedFiles.length
      setUploadedFiles(prev => [...prev, { name: file.name, chunks: 0, status: 'uploading' }])
      try {
        const result = await uploadSourceFile(file)
        setUploadedFiles(prev => prev.map((f, i) => i === idx ? { ...f, chunks: result.chunks_indexed || 0, status: 'ready' } : f))
      } catch (err) {
        setUploadedFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Erreur' } : f))
      }
    }
  }

  return (
    <div 
      className="flex flex-col h-full relative overflow-hidden bg-[#fafafa] dark:bg-[#0a0a0a]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Animated Background Orbs */}
      <motion.div 
        animate={{ 
          x: [0, 30, -20, 0], 
          y: [0, -20, 30, 0],
          scale: [1, 1.1, 0.95, 1]
        }}
        transition={{ repeat: Infinity, duration: 20, ease: "easeInOut" }}
        className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/8 blur-[120px] pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          x: [0, -30, 20, 0], 
          y: [0, 20, -30, 0],
          scale: [1, 0.95, 1.1, 1]
        }}
        transition={{ repeat: Infinity, duration: 25, ease: "easeInOut" }}
        className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/8 blur-[120px] pointer-events-none" 
      />

      {/* Drag overlay — glassmorphism */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} 
            animate={{ opacity: 1, backdropFilter: 'blur(12px)' }} 
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/5 border-2 border-dashed border-indigo-400/60 m-4 rounded-3xl"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="flex flex-col items-center gap-4 text-indigo-600 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl p-10 rounded-3xl shadow-2xl shadow-indigo-500/20 border border-indigo-200/50"
            >
              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                <Upload className="w-14 h-14" />
              </motion.div>
              <h3 className="text-xl font-bold">Déposez votre PDF ici</h3>
              <p className="text-sm text-muted-foreground">L&apos;IA indexera automatiquement le contenu</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="z-10 flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ rotate: 180, scale: 1.1 }} 
            transition={{ duration: 0.5, type: "spring" }}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0"
          >
            <Sparkles className="w-5 h-5 text-white" />
          </motion.div>
          <div>
            <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-violet-600">
              Agent Juridique IA
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1">
                <motion.span 
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-2 h-2 rounded-full bg-emerald-500 inline-block" 
                /> Actif
              </span>
              <span>•</span>
              <span>Neo4j + Web + PDF</span>
            </div>
          </div>
        </div>
        
        {/* Upload Button */}
        <motion.button
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-zinc-900 border border-border shadow-sm hover:shadow-md transition-all text-sm font-medium shrink-0"
        >
          <Upload className="w-4 h-4 text-indigo-500" />
          <span className="hidden sm:inline">Analyser un PDF</span>
          <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleUpload} className="hidden" />
        </motion.button>
      </header>

      {/* Active Uploads Badge */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="z-10 px-6 py-2 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-900/50 flex gap-2 overflow-x-auto scrollbar-hide"
          >
            {uploadedFiles.map((f, i) => (
              <motion.div 
                key={i} 
                initial={{ scale: 0, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25, delay: i * 0.05 }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm shrink-0
                  ${f.status === 'ready' ? 'bg-white dark:bg-zinc-900 border-emerald-200 text-emerald-700' : 
                    f.status === 'error' ? 'bg-white dark:bg-zinc-900 border-red-200 text-red-700' : 
                    'bg-white dark:bg-zinc-900 border-indigo-200 text-indigo-700'}`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{f.name}</span>
                {f.status === 'ready' && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /></motion.div>}
                {f.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                {f.status === 'uploading' && <span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 z-10 scroll-smooth">
        {messages.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center justify-center h-full text-center space-y-8"
          >
            <motion.div 
              className="relative"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            >
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.35, 0.2] }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 blur-2xl rounded-full" 
              />
              <motion.div 
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="w-24 h-24 rounded-3xl bg-white dark:bg-zinc-900 border border-border shadow-2xl flex items-center justify-center relative z-10"
              >
                <Sparkles className="w-12 h-12 text-indigo-500" />
              </motion.div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3"
            >
              <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
                Comment puis-je vous aider ?
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Recherche dans la base de connaissances (Startup Act), analyse en temps réel du web, ou extraction intelligente depuis vos documents PDF.
              </p>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
              {['Quels avantages fiscaux du Startup Act ?', 'Conditions pour le congé startup ?', 'Capital social minimum SUARL ?', 'Obligations de la CNSS ?'].map((q, i) => (
                <motion.button 
                  key={i} 
                  custom={i}
                  variants={suggestionVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ scale: 1.03, y: -3, boxShadow: '0 10px 40px rgba(99, 102, 241, 0.15)' }} 
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setInput(q)} 
                  className="text-left text-sm p-4 rounded-2xl border border-border/50 bg-white/50 dark:bg-zinc-900/50 hover:bg-white hover:border-indigo-300 transition-all text-muted-foreground hover:text-foreground backdrop-blur-sm"
                >
                  {q}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto pb-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div 
                  key={msg.id} 
                  custom={msg.role}
                  variants={messageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  layout
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                    <div className={`p-4 sm:p-5 rounded-3xl shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-sm shadow-indigo-500/20' 
                        : 'bg-white dark:bg-zinc-900 border border-border/50 rounded-tl-sm shadow-lg shadow-black/5'
                    }`}>
                      <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'text-white' : 'text-foreground'}`}>
                        {msg.content}
                      </p>
                    </div>
                    
                    {/* Meta info below bubble */}
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className={`flex flex-col gap-2 mt-2 px-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2">
                        {msg.sourceType && msg.role === 'assistant' && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/30 text-indigo-700 dark:text-indigo-300 font-bold uppercase tracking-wider border border-indigo-200/50">
                            <Sparkles className="w-3 h-3" />
                            {msg.sourceType}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {msg.sources.map((s, i) => (
                            <motion.a 
                              href={s.startsWith('http') ? s : '#'} target="_blank" rel="noopener noreferrer"
                              key={i} 
                              whileHover={{ scale: 1.05, y: -1 }}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground border border-border/50 transition-colors flex items-center gap-1.5 max-w-[300px] truncate"
                            >
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">{s}</span>
                            </motion.a>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="flex justify-start"
              >
                <div className="bg-white dark:bg-zinc-900 border border-border/50 p-5 rounded-3xl rounded-tl-sm shadow-lg shadow-black/5 flex items-center gap-4">
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.div 
                        key={i}
                        animate={{ 
                          y: [0, -8, 0],
                          scale: [1, 1.2, 1],
                        }} 
                        transition={{ 
                          repeat: Infinity, 
                          duration: 0.8, 
                          delay: i * 0.1,
                          ease: "easeInOut"
                        }} 
                        className={`w-2 h-2 rounded-full ${
                          i % 3 === 0 ? 'bg-indigo-500' : i % 3 === 1 ? 'bg-violet-500' : 'bg-fuchsia-500'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-violet-500">
                    Analyse en cours...
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="z-20 p-4 bg-gradient-to-t from-background via-background/90 to-transparent pt-8 shrink-0">
        <div className="max-w-3xl mx-auto relative group">
          <motion.div 
            animate={{
              opacity: input.trim() ? 0.5 : 0.2,
            }}
            className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-[24px] blur group-focus-within:opacity-50 transition duration-500"
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-border/50 rounded-3xl p-2 shadow-xl flex items-end gap-2 transition-all group-focus-within:border-indigo-300/50 group-focus-within:shadow-indigo-500/10">
            <Textarea
              placeholder="Écrivez votre requête ici..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              className="resize-none min-h-[52px] max-h-[150px] border-0 focus-visible:ring-0 px-4 py-3.5 text-[15px] bg-transparent shadow-none"
              rows={1}
            />
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 shrink-0">
              <Button 
                onClick={handleSend} 
                disabled={!input.trim() || isLoading} 
                size="icon"
                className="h-[44px] w-[44px] rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 shadow-lg disabled:opacity-50"
              >
                <Send className="h-4 w-4 text-white ml-0.5" />
              </Button>
            </motion.div>
          </div>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/60 mt-4">
          L'IA peut faire des erreurs. Vérifiez toujours les informations légales importantes.
        </p>
      </div>
    </div>
  )
}
