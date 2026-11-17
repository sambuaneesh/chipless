package app.pokerchips.server

/**
 * Minimal JSON: parse to Map/List/String/Long/Double/Boolean/null, write from the same
 * (plus Int and other Numbers). Enough for our protocol; no reflection, no dependencies.
 */
object Json {
    fun parse(s: String): Any? = Parser(s).run { val v = value(); ws(); if (i != s.length) err("trailing data"); v }

    fun write(v: Any?): String = StringBuilder().also { write(v, it) }.toString()

    fun write(v: Any?, sb: StringBuilder) {
        when (v) {
            null -> sb.append("null")
            is String -> str(v, sb)
            is Boolean -> sb.append(v)
            is Int, is Long, is Short, is Byte -> sb.append(v)
            is Number -> {
                val d = v.toDouble()
                if (d.isFinite()) {
                    if (d == Math.rint(d) && Math.abs(d) < 1e15) sb.append(d.toLong()) else sb.append(d)
                } else sb.append("null")
            }
            is Map<*, *> -> {
                sb.append('{')
                var first = true
                for ((k, x) in v) {
                    if (!first) sb.append(',')
                    first = false
                    str(k.toString(), sb); sb.append(':'); write(x, sb)
                }
                sb.append('}')
            }
            is Iterable<*> -> {
                sb.append('[')
                var first = true
                for (x in v) { if (!first) sb.append(','); first = false; write(x, sb) }
                sb.append(']')
            }
            is IntArray -> write(v.toList(), sb)
            is Array<*> -> write(v.toList(), sb)
            else -> str(v.toString(), sb)
        }
    }

    private fun str(s: String, sb: StringBuilder) {
        sb.append('"')
        for (c in s) when {
            c == '"' -> sb.append("\\\"")
            c == '\\' -> sb.append("\\\\")
            c == '\n' -> sb.append("\\n")
            c == '\r' -> sb.append("\\r")
            c == '\t' -> sb.append("\\t")
            c < ' ' || c == ' ' || c == ' ' -> sb.append(String.format("\\u%04x", c.code))
            else -> sb.append(c)
        }
        sb.append('"')
    }

    private class Parser(val s: String) {
        var i = 0
        fun err(m: String): Nothing = throw IllegalArgumentException("JSON: $m at $i")
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun value(): Any? {
            ws()
            if (i >= s.length) err("unexpected end")
            return when (val c = s[i]) {
                '{' -> obj()
                '[' -> arr()
                '"' -> string()
                't' -> lit("true", true)
                'f' -> lit("false", false)
                'n' -> lit("null", null)
                else -> if (c == '-' || c.isDigit()) num() else err("unexpected '$c'")
            }
        }
        fun lit(w: String, v: Any?): Any? { if (!s.startsWith(w, i)) err("bad literal"); i += w.length; return v }
        fun obj(): Map<String, Any?> {
            val m = LinkedHashMap<String, Any?>()
            i++; ws()
            if (s.getOrNull(i) == '}') { i++; return m }
            while (true) {
                ws(); if (s.getOrNull(i) != '"') err("expected key")
                val k = string(); ws()
                if (s.getOrNull(i) != ':') err("expected ':'")
                i++
                m[k] = value(); ws()
                when (s.getOrNull(i)) { ',' -> i++; '}' -> { i++; return m }; else -> err("expected ',' or '}'") }
            }
        }
        fun arr(): List<Any?> {
            val l = ArrayList<Any?>()
            i++; ws()
            if (s.getOrNull(i) == ']') { i++; return l }
            while (true) {
                l.add(value()); ws()
                when (s.getOrNull(i)) { ',' -> i++; ']' -> { i++; return l }; else -> err("expected ',' or ']'") }
            }
        }
        fun string(): String {
            i++
            val sb = StringBuilder()
            while (true) {
                if (i >= s.length) err("unterminated string")
                val c = s[i++]
                when (c) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        when (val e = s.getOrNull(i++)) {
                            '"', '\\', '/' -> sb.append(e)
                            'n' -> sb.append('\n'); 'r' -> sb.append('\r'); 't' -> sb.append('\t')
                            'b' -> sb.append('\b'); 'f' -> sb.append('\u000c')
                            'u' -> { if (i + 4 > s.length) err("bad escape"); sb.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4 }
                            else -> err("bad escape")
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }
        fun num(): Any {
            val st = i
            if (s[i] == '-') i++
            while (i < s.length && (s[i].isDigit() || s[i] in ".eE+-")) i++
            val t = s.substring(st, i)
            return t.toLongOrNull() ?: t.toDoubleOrNull() ?: err("bad number")
        }
    }
}

typealias Obj = Map<String, Any?>

fun Obj.str(k: String): String = this[k] as? String ?: throw IllegalArgumentException("Missing '$k'")
fun Obj.strOr(k: String, d: String?): String? = this[k] as? String ?: d
fun Obj.int(k: String): Int = (this[k] as? Number)?.toInt() ?: throw IllegalArgumentException("Missing '$k'")
fun Obj.intOr(k: String, d: Int): Int = (this[k] as? Number)?.toInt() ?: d
fun Obj.long(k: String): Long = (this[k] as? Number)?.toLong() ?: throw IllegalArgumentException("Missing '$k'")
fun Obj.longOr(k: String, d: Long): Long = (this[k] as? Number)?.toLong() ?: d
fun Obj.bool(k: String, d: Boolean = false): Boolean = this[k] as? Boolean ?: d
@Suppress("UNCHECKED_CAST")
fun Obj.obj(k: String): Obj = this[k] as? Obj ?: throw IllegalArgumentException("Missing '$k'")
@Suppress("UNCHECKED_CAST")
fun Obj.list(k: String): List<Any?> = this[k] as? List<Any?> ?: throw IllegalArgumentException("Missing '$k'")
fun Obj.ints(k: String): List<Int> = list(k).map { (it as Number).toInt() }
fun Obj.strs(k: String): List<String> = list(k).map { it as String }
