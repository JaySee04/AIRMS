import Image from 'next/image';

// The ISN branding panel of the split auth card.
//
// This markup stood identically in all four auth pages — login, forgot
// password, verify OTP and reset password. Identical is the problem: the
// institute's name and postal address were hardcoded four times, so changing
// them would have updated one page and left three quietly stale, on the only
// screens an outside visitor sees.
//
// The split login card is a locked Figma-derived design (MASTER_CLARIFICATIONS
// §12). Nothing about it changes here: the class names, element order and
// content are exactly what the four copies rendered — this is one copy instead
// of four, not a redesign.
//
// The product was renamed SPIRiT on 2026-11-03 (JC): the logo slot now holds
// the SPIRiT caduceus and the tagline its expansion. ISN stays named as text.
export default function LoginBrand() {
  return (
    <div className="login-left">
      <div className="login-logos">
        <Image className="login-logo" src="/images/spirit-logo.png" alt="SPIRiT" width={134} height={150} priority quality={100} />
      </div>
      <div className="login-left-body">
        <h2 className="login-tagline">Sports Performance,<br />Injury Risk &amp; Technology</h2>
        <p className="login-org">INSTITUT SUKAN NEGARA</p>
        <p className="login-address">
          Kompleks Sukan Negara<br />
          57000 Bukit Jalil, Kuala Lumpur
        </p>
      </div>
    </div>
  );
}
