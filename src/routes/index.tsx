import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { LandingNav, NAV_LINKS } from '@/components/landing/LandingNav'
import { HeroPreview } from '@/components/landing/HeroPreview'
import { PlantSchematic } from '@/components/landing/PlantSchematic'
import {
  company, exhibition, hero, posters, product, profile, programPhoto, projectTypes, research, services, supportServices,
  type GalleryItem,
} from '@/components/landing/content'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: LandingPage })

// Palet dari logo Digihydrotek: biru tua #01448A dan biru air #109CD5.
const muted = 'text-[#4A5D73] dark:text-[#93A7BE]'
const rule = 'border-[#D5DEE8] dark:border-[#1C2D44]'
const label = 'font-plex text-[12px] uppercase tracking-[0.12em]'

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F4F7FA] font-brand text-[#0B1B2E] dark:bg-[#08111F] dark:text-[#E3ECF6]">
      <LandingNav />
      <main id="beranda">
        <Hero />
        <Profile />
        <Services />
        <Product />
        <Activities />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero: foto panel asli + pernyataan bidang usaha
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:pb-24 lg:pt-16">
      <div className="grid items-end gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <p className={cn(label, 'text-[#01448A] dark:text-[#5BB8EA]')}>{hero.kicker}</p>
          <h1 className="mt-5 font-brand-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.01em] sm:text-6xl lg:text-[4.4rem]">
            Sistem kendali dan monitoring untuk pembangkit listrik{' '}
            <span className="text-[#01448A] dark:text-[#5BB8EA]">tenaga air</span>.
          </h1>
          <p className={cn('mt-6 max-w-xl text-lg leading-8', muted)}>{hero.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#layanan" className="inline-flex items-center gap-2 rounded-md bg-[#01448A] px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#013A75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] focus-visible:ring-offset-2 dark:bg-[#109CD5] dark:text-[#04121F] dark:hover:bg-[#2BAAE0]">
              Lihat layanan <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-md border border-[#B9C7D6] px-5 py-3 text-[15px] font-semibold text-[#0B1B2E] transition-colors hover:border-[#01448A] hover:text-[#01448A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] dark:border-[#2A3E58] dark:text-[#E3ECF6] dark:hover:border-[#5BB8EA] dark:hover:text-white">
              Masuk platform monitoring <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <figure className="lg:col-span-5">
          <div className={cn('overflow-hidden rounded-lg border bg-white dark:bg-[#0D1A2D]', rule)}>
            <img src={hero.photo.src} alt={hero.photo.alt} width={568} height={560} className="aspect-[568/560] w-full object-cover" />
          </div>
          <figcaption className={cn('mt-3', label, muted)}>{hero.photo.caption}</figcaption>
        </figure>
      </div>

      <dl className={cn('mt-14 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t pt-6', rule)}>
        <dt className={cn(label, muted)}>Cakupan proyek</dt>
        {projectTypes.map((type) => (
          <dd key={type} className="font-brand-display text-2xl font-semibold tracking-tight">{type}</dd>
        ))}
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

function Profile() {
  return (
    <section id="profil" className={cn('scroll-mt-16 border-t bg-white dark:bg-[#0B1626]', rule)}>
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:py-24">
        <div className="lg:col-span-7">
          <p className={cn(label, 'text-[#01448A] dark:text-[#5BB8EA]')}>Profil perusahaan</p>
          <h2 className="mt-4 font-brand-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{profile.statement}</h2>
          <div className={cn('mt-6 max-w-2xl space-y-4 text-[17px] leading-8', muted)}>
            {profile.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
        <dl className={cn('self-end border-t lg:col-span-5', rule)}>
          {profile.facts.map((fact) => (
            <div key={fact.term} className={cn('grid gap-1 border-b py-4 sm:grid-cols-[10rem_1fr] sm:gap-4', rule)}>
              <dt className={cn(label, muted, 'pt-0.5')}>{fact.term}</dt>
              <dd className="text-[16px] leading-6">{fact.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Layanan: skema pembangkit + keterangan berhuruf
// ---------------------------------------------------------------------------

function Services() {
  const [active, setActive] = useState<(typeof services)[number]['marker'] | null>(null)
  return (
    <section id="layanan" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className={cn(label, 'text-[#01448A] dark:text-[#5BB8EA]')}>Layanan</p>
            <h2 className="mt-4 font-brand-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Di setiap bagian pembangkit, dari sungai hingga ruang kontrol.
            </h2>
          </div>
          <p className={cn('self-end text-[17px] leading-8 lg:col-span-5', muted)}>
            Huruf pada skema menunjukkan bagian pembangkit yang ditangani tiap layanan. Pilih salah satu layanan untuk menandainya di skema.
          </p>
        </div>

        <div className={cn('mt-10 overflow-hidden rounded-lg border bg-white dark:bg-[#0B1626]', rule)}>
          <PlantSchematic active={active} />
        </div>

        <ul className={cn('mt-2 grid border-t sm:grid-cols-2 lg:grid-cols-4', rule)}>
          {services.map((service, index) => (
            <li
              key={service.marker}
              tabIndex={0}
              onMouseEnter={() => setActive(service.marker)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(service.marker)}
              onBlur={() => setActive(null)}
              className={cn(
                'border-b py-6 outline-none transition-colors focus-visible:bg-[#109CD5]/10 sm:px-5 lg:border-b-0',
                rule,
                index > 0 && 'lg:border-l',
                index % 2 === 1 && 'sm:border-l',
                active === service.marker && 'bg-[#109CD5]/[0.07]',
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full font-brand-display text-[15px] font-bold text-white transition-colors',
                  active === service.marker ? 'bg-[#109CD5]' : 'bg-[#01448A] dark:bg-[#1B6FC2]',
                )}>{service.marker}</span>
                <span className={cn(label, muted)}>{service.where}</span>
              </div>
              <h3 className="mt-4 font-brand-display text-[1.45rem] font-semibold leading-tight">{service.title}</h3>
              <p className={cn('mt-2 text-[15px] leading-7', muted)}>{service.text}</p>
              <p className="mt-3 font-plex text-[12px] text-[#01448A] dark:text-[#5BB8EA]">{service.points.join(' · ')}</p>
            </li>
          ))}
        </ul>

        <div className={cn('mt-12 grid gap-4 border-t pt-6 lg:grid-cols-12', rule)}>
          <h3 className={cn(label, muted, 'lg:col-span-3')}>Layanan pendukung</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[16px] font-medium lg:col-span-9">
            {supportServices.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#109CD5]" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Produk: sistem monitoring sungai (pita biru tua)
// ---------------------------------------------------------------------------

function Product() {
  return (
    <section id="produk" className="scroll-mt-16 bg-[#01284F] text-white dark:bg-[#061C36]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p className={cn(label, 'text-[#7FCDF0]')}>Produk riset</p>
            <h2 className="mt-4 font-brand-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{product.name}</h2>
            <p className="mt-6 text-[17px] leading-8 text-[#C8D8EA]">{product.description}</p>

            <ol aria-label="Alur data" className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2 font-plex text-[13px]">
              {product.chain.map((step, index) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="rounded border border-white/25 px-2.5 py-1">{step}</span>
                  {index < product.chain.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-[#7FCDF0]" aria-hidden="true" />}
                </li>
              ))}
            </ol>

            <p className="mt-8 flex items-center gap-2 text-[15px] text-[#C8D8EA]">
              <MapPin className="h-4 w-4 text-[#7FCDF0]" aria-hidden="true" />
              {product.site}
            </p>
            <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[15px] font-semibold text-[#01284F] transition-colors hover:bg-[#E3F3FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FCDF0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#01284F]">
              Masuk platform monitoring <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <dl className="self-start border-t border-white/20 lg:col-span-5 lg:col-start-8">
            {product.specs.map((spec) => (
              <div key={spec.label} className="grid gap-1 border-b border-white/20 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className={cn(label, 'pt-0.5 text-[#7FCDF0]')}>{spec.label}</dt>
                <dd className="text-[16px] leading-6">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-14 grid items-center gap-8 lg:grid-cols-12">
          <figure className="lg:col-span-5">
            <img src={product.interiorPhoto.src} alt={product.interiorPhoto.alt} width={640} height={400} loading="lazy" decoding="async" className="aspect-[8/5] w-full rounded-lg object-cover" />
            <figcaption className={cn(label, 'mt-3 text-[#9DB5CE]')}>Isi panel kontrol · PLC, catu daya, proteksi</figcaption>
          </figure>
          <div className="lg:col-span-7 [&_figcaption]:text-[#9DB5CE]">
            <HeroPreview />
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Kegiatan: riset, pameran, dan materi perusahaan
// ---------------------------------------------------------------------------

function Activities() {
  return (
    <section id="kegiatan" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className={cn(label, 'text-[#01448A] dark:text-[#5BB8EA]')}>Riset & kegiatan</p>
            <h2 className="mt-4 font-brand-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Dikembangkan lewat {research.program}.
            </h2>
          </div>
          <div className="self-end lg:col-span-5">
            <p className={cn(label, muted)}>{research.scheme}</p>
            <p className="mt-2 text-[16px] leading-7">{research.parties.join(' · ')}</p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <Photo item={exhibition} className="lg:col-span-5" imgClass="aspect-[716/532]" />
          <Photo item={programPhoto} className="lg:col-span-7" imgClass="aspect-[16/9]" />
        </div>

        <div className={cn('mt-12 grid gap-8 border-t pt-8 lg:grid-cols-12', rule)}>
          <div className="lg:col-span-4">
            <h3 className={cn(label, muted)}>Materi perusahaan</h3>
            <p className="mt-3 text-[16px] leading-7">Poster layanan Digihydrotek. Pilih gambar untuk melihat ukuran penuh.</p>
          </div>
          <div className="grid grid-cols-2 gap-6 lg:col-span-8">
            {posters.map((poster) => (
              <a key={poster.src} href={poster.src} target="_blank" rel="noreferrer" className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] focus-visible:ring-offset-4">
                <img src={poster.src} alt={poster.alt} width={poster.width} height={poster.height} loading="lazy" decoding="async" className={cn('aspect-[1024/1420] w-full rounded-lg border object-cover transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none', rule)} />
                <p className="mt-3 font-brand-display text-lg font-semibold">{poster.title}</p>
                <p className={cn('mt-1 text-[14px] leading-6', muted)}>{poster.text}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Photo({ item, className, imgClass }: { item: GalleryItem; className?: string; imgClass?: string }) {
  return (
    <figure className={className}>
      <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async" className={cn('w-full rounded-lg border object-cover', rule, imgClass)} />
      <figcaption className="mt-3">
        <span className="font-brand-display text-lg font-semibold">{item.title}</span>
        <span className={cn('mt-1 block text-[14px] leading-6', muted)}>{item.text}</span>
      </figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Kontak
// ---------------------------------------------------------------------------

function Contact() {
  const { email, whatsapp, phone, address } = company.contact
  const items = [
    whatsapp && { icon: MessageCircle, text: 'WhatsApp', href: `https://wa.me/${whatsapp}` },
    phone && { icon: Phone, text: phone, href: `tel:${phone.replace(/\s/g, '')}` },
    email && { icon: Mail, text: email, href: `mailto:${email}` },
    address && { icon: MapPin, text: address, href: null },
  ].filter(Boolean) as Array<{ icon: typeof Mail; text: string; href: string | null }>

  return (
    <section id="kontak" className={cn('scroll-mt-16 border-t bg-white dark:bg-[#0B1626]', rule)}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:py-24">
        <div className="lg:col-span-7">
          <p className={cn(label, 'text-[#01448A] dark:text-[#5BB8EA]')}>Kontak</p>
          <h2 className="mt-4 font-brand-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Diskusikan kebutuhan pembangkit Anda.
          </h2>
          <p className={cn('mt-6 max-w-xl text-[17px] leading-8', muted)}>
            Ceritakan kondisi pembangkit dan sistem yang ingin dibangun atau dimodernisasi. Tim Digihydrotek akan membantu memetakan kebutuhannya.
          </p>
        </div>
        <div className="self-end lg:col-span-5">
          {items.length > 0 ? (
            <ul className={cn('border-t', rule)}>
              {items.map(({ icon: Icon, text, href }) => (
                <li key={text} className={cn('border-b', rule)}>
                  {href ? (
                    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex items-center gap-3 py-4 text-[17px] font-medium hover:text-[#01448A] dark:hover:text-[#5BB8EA]">
                      <Icon className="h-5 w-5 text-[#109CD5]" aria-hidden="true" />{text}
                    </a>
                  ) : (
                    <span className="flex items-start gap-3 py-4 text-[17px]"><Icon className="mt-0.5 h-5 w-5 text-[#109CD5]" aria-hidden="true" />{text}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-[#01448A] hover:underline dark:text-[#5BB8EA]">
            Sudah menjadi pelanggan? Masuk platform monitoring <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="bg-[#061A31] text-[#C8D8EA]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-12">
        <div className="md:col-span-6">
          <Logo tone="dark" className="h-9" />
          <p className="mt-4 font-plex text-[12px] uppercase tracking-[0.12em] text-[#7FCDF0]">{company.tagline}</p>
          <p className="mt-4 max-w-md text-[15px] leading-7">{company.summary}</p>
        </div>
        <FooterColumn title="Perusahaan" className="md:col-span-3">
          {NAV_LINKS.map((link) => <a key={link.href} href={link.href} className="hover:text-white">{link.label}</a>)}
        </FooterColumn>
        <FooterColumn title="Platform" className="md:col-span-3">
          <Link to="/login" className="hover:text-white">Masuk</Link>
          <Link to="/dashboard" className="hover:text-white">Dashboard monitoring</Link>
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[13px] text-[#9DB5CE] sm:px-6">
          © {new Date().getFullYear()} {company.name}. Seluruh hak cipta dilindungi.
        </p>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="font-plex text-[12px] uppercase tracking-[0.12em] text-[#7FCDF0]">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-[15px]">{children}</div>
    </div>
  )
}
