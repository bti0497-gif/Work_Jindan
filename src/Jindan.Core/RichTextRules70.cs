using System.Globalization;
using System.Text;

namespace Jindan.Core;

// Narrow native paragraph/character formatting. No object, picture, field, file,
// HTML, scripts, stylesheet, binary payload or unknown destination is accepted.
public static class RichTextRules70
{
    public const int MaxLength = 600000;
    static readonly HashSet<string> Words = new(("rtf ansi ansicpg deff deflang deflangfe fonttbl colortbl generator f fnil fswiss froman fmodern fscript fdecor ftech fbidi fcharset fprq red green blue viewkind uc pard plain lang langfe b i ul ulnone strike fs cf highlight par line tab u ql qc qr qj fi li ri sa sb sl slmult tx jclisttab pntext pntxta pntxtb pn pnlvlblt pnstart pnindent pncont pnf pnfs pnb pni pnu bullet ltrpar rtlpar ltrch rtlch nouicompat widctlpar nowidctlpar keep keepn intbl cpg loch hich dbch insrsid charrsid pararsid sectd sect mmathPr margl margr margt margb paperw paperh fcs cs cs0 fdbmajor fdbminor af afs langnp langfenp noproof expnd expndtw kerning up dn sub super nosupersub cell row trowd trgaph trleft cellx clvertalt clvertalc clvertalb clbrdrt clbrdrl clbrdrb clbrdrr brdrs brdrw brdrcf trbrdrt trbrdrl trbrdrb trbrdrr trbrdrh trbrdrv".Split(' ', StringSplitOptions.RemoveEmptyEntries)), StringComparer.Ordinal);
    public static string Normalize(string value) => value.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');
    public static void Validate(string rtf, string content)
    {
        if (rtf.Length == 0) return;
        DomainRules.Require(Normalize(PlainText(rtf)) == Normalize(content), "RICH_TEXT_MISMATCH", "Formatted text must match the searchable plain content.");
    }
    public static string PlainText(string rtf)
    {
        static void Require(bool ok) => DomainRules.Require(ok, "RICH_TEXT_FORMAT", "Unsupported or invalid native text formatting.");
        Require(rtf.Length <= MaxLength && Encoding.UTF8.GetByteCount(rtf) <= MaxLength && rtf.StartsWith("{\\rtf1", StringComparison.Ordinal));
        var output = new StringBuilder(); var stack = new Stack<(bool Skip, int Uc, bool FontTable, int? DefiningFont, int? CurrentFont)>(); bool skip = false, fontTable = false; int? definingFont = null, currentFont = null; int uc = 1, fallback = 0, codepage = 1252, defaultFont = 0, roots = 0;
        var fontPages = new Dictionary<int, int>();
        var bytes = new List<byte>();
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        void Append(char c) { if (fallback > 0) { fallback--; return; } if (!skip) output.Append(c); }
        void Flush() { if (bytes.Count == 0) return; if (skip) { bytes.Clear(); return; } var effectivePage = fontPages.GetValueOrDefault(currentFont ?? defaultFont, codepage); string text; try { text = Encoding.GetEncoding(effectivePage, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback).GetString(bytes.ToArray()); } catch (DecoderFallbackException) { throw new WorkspaceException("RICH_TEXT_FORMAT", "Invalid encoded native text."); } catch (ArgumentException) { throw new WorkspaceException("RICH_TEXT_FORMAT", "Unsupported native text codepage."); } foreach (var c in text) Append(c); bytes.Clear(); }
        for (int pos = 0; pos < rtf.Length;)
        {
            var c = rtf[pos++];
            if (c == '{') { Flush(); if (stack.Count == 0) { roots++; Require(roots == 1); } Require(stack.Count < 64); stack.Push((skip, uc, fontTable, definingFont, currentFont)); continue; }
            if (c == '}') { Flush(); Require(stack.Count > 0); (skip, uc, fontTable, definingFont, currentFont) = stack.Pop(); continue; }
            Require(stack.Count > 0 || char.IsWhiteSpace(c));
            if (c is '\r' or '\n') continue;
            if (c != '\\') { Flush(); Require(!char.IsControl(c)); Append(c); continue; }
            Require(pos < rtf.Length); c = rtf[pos++];
            if (c == '\'') { Require(pos + 2 <= rtf.Length && byte.TryParse(rtf.AsSpan(pos, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out _)); bytes.Add(byte.Parse(rtf.AsSpan(pos, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture)); pos += 2; continue; }
            Flush();
            if (c is '\\' or '{' or '}') { Append(c); continue; }
            if (c == '~') { Append('\u00a0'); continue; }
            if (c == '-') { continue; }
            if (c == '_') { Append('\u2011'); continue; }
            if (c == '*') { continue; } // Destination still has to be explicitly allowed below.
            Require(char.IsAsciiLetter(c)); var begin = pos - 1; while (pos < rtf.Length && char.IsAsciiLetter(rtf[pos])) pos++;
            var word = rtf[begin..pos]; Require(Words.Contains(word));
            bool negative = pos < rtf.Length && rtf[pos] == '-'; if (negative) pos++; var numberStart = pos; while (pos < rtf.Length && char.IsAsciiDigit(rtf[pos])) pos++;
            int? number = null; if (pos > numberStart) { Require(pos - numberStart < 10 && int.TryParse(rtf.AsSpan(numberStart, pos - numberStart), out _)); number = int.Parse(rtf.AsSpan(numberStart, pos - numberStart), CultureInfo.InvariantCulture) * (negative ? -1 : 1); }
            else Require(!negative);
            if (pos < rtf.Length && rtf[pos] == ' ') pos++;
            if (number is not null && word != "u") Require(number is >= -100000 and <= 100000);
            if (word is "fs" or "afs") Require(number is >= 1 and <= 144);
            if (word is "red" or "green" or "blue") Require(number is >= 0 and <= 255);
            if (word == "fonttbl") fontTable = true;
            if (word == "deff") { Require(number is >= 0 and <= 4096); defaultFont = number!.Value; }
            if (word == "f") { Require(number is >= 0 and <= 4096); if (fontTable) definingFont = number; else currentFont = number; }
            if (fontTable && definingFont is int font && word == "cpg") { Require(number is > 0 and <= 65535); fontPages[font] = number!.Value; }
            if (fontTable && definingFont is int charsetFont && word == "fcharset")
            {
                Require(number is >= 0 and <= 255);
                var page = number switch { 128 => 932, 129 => 949, 134 => 936, 136 => 950, 161 => 1253, 162 => 1254, 163 => 1258, 177 => 1255, 178 => 1256, 186 => 1257, 204 => 1251, 222 => 874, 238 => 1250, 77 => 10000, 255 => 437, _ => 0 };
                if (page != 0) fontPages[charsetFont] = page;
            }
            if (word is "fonttbl" or "colortbl" or "generator" or "pntext" or "pntxta" or "pntxtb" or "pn") { skip = true; continue; }
            if (word == "uc") { Require(number is >= 0 and <= 8); uc = number!.Value; }
            if (word == "ansicpg") { Require(number is > 0 and <= 65535); codepage = number!.Value; }
            if (word == "u") { Require(number is >= short.MinValue and <= ushort.MaxValue); if (!skip) output.Append((char)(ushort)number!.Value); fallback = uc; }
            if (!skip && word is "par" or "line") { output.Append('\n'); fallback = 0; }
            if (!skip && word == "tab") Append('\t');
            if (!skip && word == "bullet") Append('\u2022');
        }
        Flush(); Require(stack.Count == 0 && roots == 1);
        var textOutput = output.ToString();
        // RichEdit emits one terminating paragraph even when Text has no trailing newline.
        return textOutput.EndsWith('\n') ? textOutput[..^1] : textOutput;
    }
}
