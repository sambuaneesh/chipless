package app.pokerchips.server

import app.pokerchips.engine.Entry
import app.pokerchips.engine.Event
import app.pokerchips.engine.Move

/** Event <-> JSON for the persisted log. Field names are short and stable. */
object Codec {
    fun encode(e: Event): Map<String, Any?> = when (e) {
        is Event.Create -> mapOf("e" to "create", "names" to e.names, "stack" to e.stack, "button" to e.button)
        is Event.AddPlayer -> mapOf("e" to "add", "name" to e.name, "stack" to e.stack, "index" to e.index, "entry" to e.entry.name)
        is Event.RemovePlayer -> mapOf("e" to "remove", "id" to e.id)
        is Event.SitOut -> mapOf("e" to "sitout", "id" to e.id)
        is Event.SitIn -> mapOf("e" to "sitin", "id" to e.id, "entry" to e.entry.name)
        is Event.Rebuy -> mapOf("e" to "rebuy", "id" to e.id, "chips" to e.chips)
        is Event.Adjust -> mapOf("e" to "adjust", "id" to e.id, "stack" to e.stack)
        is Event.Rename -> mapOf("e" to "rename", "id" to e.id, "name" to e.name)
        is Event.Reorder -> mapOf("e" to "reorder", "ids" to e.ids)
        is Event.SetButton -> mapOf("e" to "button", "id" to e.id)
        is Event.StartHand -> mapOf("e" to "deal", "sb" to e.sb, "bb" to e.bb)
        is Event.Act -> mapOf("e" to "act", "id" to e.id, "move" to e.move.name, "to" to e.to)
        is Event.Award -> mapOf(
            "e" to "award", "ranking" to e.ranking, "board" to e.board,
            "holes" to e.holes.mapKeys { it.key.toString() },
        )
    }

    fun decode(o: Obj): Event = when (val t = o.str("e")) {
        "create" -> Event.Create(o.strs("names"), o.int("stack"), o.int("button"))
        "add" -> Event.AddPlayer(o.str("name"), o.int("stack"), o.int("index"), Entry.valueOf(o.str("entry")))
        "remove" -> Event.RemovePlayer(o.int("id"))
        "sitout" -> Event.SitOut(o.int("id"))
        "sitin" -> Event.SitIn(o.int("id"), Entry.valueOf(o.str("entry")))
        "rebuy" -> Event.Rebuy(o.int("id"), o.int("chips"))
        "adjust" -> Event.Adjust(o.int("id"), o.int("stack"))
        "rename" -> Event.Rename(o.int("id"), o.str("name"))
        "reorder" -> Event.Reorder(o.ints("ids"))
        "button" -> Event.SetButton(o.int("id"))
        "deal" -> Event.StartHand(o.int("sb"), o.int("bb"))
        "act" -> Event.Act(o.int("id"), Move.valueOf(o.str("move")), o.intOr("to", 0))
        "award" -> Event.Award(
            o.list("ranking").map { g -> (g as List<*>).map { (it as Number).toInt() } },
            o.ints("board"),
            o.obj("holes").entries.associate { (k, v) -> k.toInt() to (v as List<*>).map { (it as Number).toInt() } },
        )
        else -> throw IllegalArgumentException("Unknown event $t")
    }
}
