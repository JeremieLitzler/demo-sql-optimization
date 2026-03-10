-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE Country (
    IsoCode  CHAR(2)      PRIMARY KEY,
    Name     VARCHAR(100) NOT NULL
);

CREATE TABLE Project (
    Number   SERIAL       PRIMARY KEY,
    Name     VARCHAR(100) NOT NULL,
    IsActive BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE "User" (
    Id          SERIAL       PRIMARY KEY,
    Username    VARCHAR(100) NOT NULL UNIQUE,
    Email       VARCHAR(150) NOT NULL UNIQUE,
    FullName    VARCHAR(200),
    IsActive    BOOLEAN      NOT NULL DEFAULT TRUE,
    CreatedOn   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE UserProjectAccess (
    Id            SERIAL  PRIMARY KEY,
    UserId        INT     NOT NULL REFERENCES "User"(Id),
    ProjectNumber INT     NOT NULL REFERENCES Project(Number),
    IsActive      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Contractor (
    Id              SERIAL       PRIMARY KEY,
    Name            VARCHAR(100) NOT NULL,
    Address         VARCHAR(200),
    Address2        VARCHAR(200),
    ZipCode         VARCHAR(20),
    City            VARCHAR(100),
    CountryIsoCode  CHAR(2)      REFERENCES Country(IsoCode),
    ContactEmail    VARCHAR(150),
    IsEmailVerified BOOLEAN DEFAULT FALSE,
    TaxId           VARCHAR(50),
    AgencyName      VARCHAR(100),
    AgencyAddress   VARCHAR(200),
    AgencyAddress2  VARCHAR(200),
    AgencyCountryIsoCode CHAR(2)  REFERENCES Country(IsoCode),
    IsActive        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ProjectContractor (
    ProjectNumber   INT         NOT NULL REFERENCES Project(Number),
    ContractorId    INT         NOT NULL REFERENCES Contractor(Id),
    IsActive        BOOLEAN     NOT NULL DEFAULT TRUE,
    CreatedOn       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ProjectNumber, ContractorId)
);

CREATE TABLE Assignment (
    Id        SERIAL       PRIMARY KEY,
    CreatedOn TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    Notes     TEXT
);

CREATE TABLE InternationalAssignment (
    Id           INT PRIMARY KEY REFERENCES Assignment(Id),
    ContractorId INT NOT NULL    REFERENCES Contractor(Id)
);